/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addContextMenuPatch, NavContextMenuPatchCallback, removeContextMenuPatch } from "@api/ContextMenu";
import { RelationshipType } from "@endcord/discord-types/enums";
import { Devs } from "@utils/constants";
import { t } from "@utils/i18n";
import { Modals, openModal } from "@utils/modal";
import definePlugin from "@utils/types";
import { findByPropsLazy, findStoreLazy } from "@webpack";
import { ChannelStore, FluxDispatcher, GuildMemberStore, Menu, React, RelationshipStore, showToast, UserStore, UserUtils } from "@webpack/common";

// fakeState is in memory only — does NOT persist across restarts
const fakeState = new Map<string, "pending" | "accepted">();

async function persistState() {
    // No persistence — fakeState reset on restart intentionally
}

async function loadState() {
    // No loading at startup — fakeState starts empty
}

// ── Patch RelationshipStore ────────────────────────────────────────────────────
let origGetRelType: Function | null = null;
let origIsFriend: Function | null = null;
let origGetFriendIDs: Function | null = null;
let origGetMutable: Function | null = null;

function patchStore() {
    const store = RelationshipStore as any;
    if (!origGetRelType && typeof store.getRelationshipType === "function") {
        origGetRelType = store.getRelationshipType;
        store.getRelationshipType = function (userId: string) {
            const s = fakeState.get(userId);
            if (s === "accepted") return RelationshipType.FRIEND;
            if (s === "pending") return RelationshipType.INCOMING_REQUEST;
            return origGetRelType!.call(this, userId);
        };
    }
    if (!origIsFriend && typeof store.isFriend === "function") {
        origIsFriend = store.isFriend;
        store.isFriend = function (userId: string) {
            if (fakeState.get(userId) === "accepted") return true;
            return origIsFriend!.call(this, userId);
        };
    }
    if (!origGetFriendIDs && typeof store.getFriendIDs === "function") {
        origGetFriendIDs = store.getFriendIDs;
        store.getFriendIDs = function () {
            const real: string[] = origGetFriendIDs!.call(this);
            const extra = [...fakeState.entries()].filter(([, s]) => s === "accepted").map(([id]) => id);
            return [...new Set([...real, ...extra])];
        };
    }
    if (!origGetMutable && typeof store.getMutableRelationships === "function") {
        origGetMutable = store.getMutableRelationships;
        store.getMutableRelationships = function () {
            const real = origGetMutable!.call(this);
            for (const [id, s] of fakeState) {
                if (s === "accepted") real.set(id, RelationshipType.FRIEND);
                if (s === "pending") real.set(id, RelationshipType.INCOMING_REQUEST);
            }
            return real;
        };
    }
}

function unpatchStore() {
    const store = RelationshipStore as any;
    if (origGetRelType) { store.getRelationshipType = origGetRelType; origGetRelType = null; }
    if (origIsFriend) { store.isFriend = origIsFriend; origIsFriend = null; }
    if (origGetFriendIDs) { store.getFriendIDs = origGetFriendIDs; origGetFriendIDs = null; }
    if (origGetMutable) { store.getMutableRelationships = origGetMutable; origGetMutable = null; }
}

// ── Patch acceptFriend ─────────────────────────────────────────────────────────
let origAccept: Function | null = null;

function patchAcceptFriend() {
    try {
        const RA = findByPropsLazy("acceptFriendRequest", "cancelFriendRequest");
        if (!RA || origAccept) return;
        origAccept = RA.acceptFriendRequest;
        // Discord passes { userId, ... }; older builds passed the id directly
        RA.acceptFriendRequest = async function (arg: any, ...args: any[]) {
            const userId: string = typeof arg === "object" ? arg?.userId : arg;
            if (fakeState.get(userId) === "pending") {
                fakeState.set(userId, "accepted");
                await persistState();
                FluxDispatcher.dispatch({
                    type: "RELATIONSHIP_UPDATE",
                    relationship: { id: userId, type: RelationshipType.FRIEND, nickname: null, since: new Date().toISOString() }
                });
                return;
            }
            return origAccept!.call(this, arg, ...args);
        };
    } catch (e) { console.warn("[FF] patchAcceptFriend:", e); }
}

function unpatchAcceptFriend() {
    try {
        if (!origAccept) return;
        const RA = findByPropsLazy("acceptFriendRequest", "cancelFriendRequest");
        if (RA) RA.acceptFriendRequest = origAccept;
        origAccept = null;
    } catch { }
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function makeUserPayload(user: any) {
    return {
        id: user.id,
        username: user.username,
        global_name: user.globalName ?? user.username,
        avatar: user.avatar ?? null,
        discriminator: user.discriminator ?? "0",
        public_flags: user.publicFlags ?? 0,
        flags: user.flags ?? 0,
        bot: false,
    };
}

function isBot(user: any): boolean {
    if (!user) return true;
    if (user.bot === true) return true;
    if ((user.publicFlags ?? 0) & (1 << 19)) return true;
    return false;
}

function dispatchRelationship(user: any, type: RelationshipType) {
    FluxDispatcher.dispatch({
        type: "RELATIONSHIP_UPDATE",
        relationship: { id: user.id, type, nickname: null, since: new Date().toISOString(), user: makeUserPayload(user) }
    });
}

async function addDirectFriend(user: any) {
    fakeState.set(user.id, "accepted");
    await persistState();
    dispatchRelationship(user, RelationshipType.FRIEND);
}

async function addPendingRequest(user: any) {
    fakeState.set(user.id, "pending");
    await persistState();
    FluxDispatcher.dispatch({
        type: "RELATIONSHIP_ADD",
        relationship: {
            id: user.id,
            type: RelationshipType.INCOMING_REQUEST,
            nickname: null,
            since: new Date().toISOString(),
            user: makeUserPayload(user),
        },
        incoming: true,
    });
}

// ── Reapplying fakeStates at startup ──────────────────────────────────
// After reload, we redispatch all saved states
async function reapplyFakeStates() {
    for (const [userId, state] of fakeState) {
        try {
            let user = UserStore.getUser(userId) as any;
            if (!user) {
                try { await UserUtils.getUser(userId); } catch { }
                user = UserStore.getUser(userId) as any;
            }
            if (!user) continue;

            if (state === "accepted") {
                FluxDispatcher.dispatch({
                    type: "RELATIONSHIP_UPDATE",
                    relationship: { id: userId, type: RelationshipType.FRIEND, nickname: null, since: new Date().toISOString(), user: makeUserPayload(user) }
                });
            } else if (state === "pending") {
                FluxDispatcher.dispatch({
                    type: "RELATIONSHIP_ADD",
                    relationship: { id: userId, type: RelationshipType.INCOMING_REQUEST, nickname: null, since: new Date().toISOString(), user: makeUserPayload(user) },
                    incoming: true,
                });
            }
            await new Promise(r => setTimeout(r, 50));
        } catch { }
    }
}

const fakeDMChannelObjects = new Map<string, any>();
let origGetChannel: Function | null = null;
let origGetDMFromUserId: Function | null = null;
let origGetSorted: Function | null = null;

function patchChannelStore() {
    const store = ChannelStore as any;

    if (!origGetChannel && typeof store.getChannel === "function") {
        origGetChannel = store.getChannel;
        store.getChannel = function (id: string) {
            if (fakeDMChannelObjects.has(id)) return fakeDMChannelObjects.get(id);
            return origGetChannel!.call(this, id);
        };
    }

    if (!origGetDMFromUserId && typeof store.getDMFromUserId === "function") {
        origGetDMFromUserId = store.getDMFromUserId;
        store.getDMFromUserId = function (userId: string) {
            for (const [cid, ch] of fakeDMChannelObjects) {
                if ((ch.recipientIDs ?? []).includes(userId)) return cid;
            }
            return origGetDMFromUserId!.call(this, userId);
        };
    }

    if (!origGetSorted && typeof store.getSortedPrivateChannels === "function") {
        origGetSorted = store.getSortedPrivateChannels;
        store.getSortedPrivateChannels = function () {
            const real = origGetSorted!.call(this) ?? [];
            return [...real, ...fakeDMChannelObjects.values()];
        };
    }
}

function unpatchChannelStore() {
    const store = ChannelStore as any;
    if (origGetChannel) { store.getChannel = origGetChannel; origGetChannel = null; }
    if (origGetDMFromUserId) { store.getDMFromUserId = origGetDMFromUserId; origGetDMFromUserId = null; }
    if (origGetSorted) { store.getSortedPrivateChannels = origGetSorted; origGetSorted = null; }
    fakeDMChannelObjects.clear();
}

async function loadUser(userId: string): Promise<any | null> {
    try { await UserUtils.getUser(userId); } catch { }
    return UserStore.getUser(userId) ?? null;
}

async function doFakeFriend(userId: string) {
    const user = await loadUser(userId);
    if (!user || isBot(user)) return;
    await addDirectFriend(user);
}

async function doFakeFriendRequest(userId: string) {
    const user = await loadUser(userId);
    if (!user || isBot(user)) return;
    await addPendingRequest(user);
}

// ── Modal React pour saisir un nombre ─────────────────────────────────────────────
function askCount(title: string, max: number): Promise<number | null> {
    return new Promise(resolve => {
        const resolveRef = { current: resolve, done: false };

        function CountModal({ modalProps }: { modalProps: any; }) {
            const [value, setValue] = React.useState(String(Math.min(10, max)));
            const parsed = parseInt(value, 10);
            const valid = !isNaN(parsed) && parsed > 0 && parsed <= max;

            function confirm() {
                if (!valid || resolveRef.done) return;
                resolveRef.done = true;
                modalProps.onClose();
                resolveRef.current(parsed);
            }

            function cancel() {
                if (!resolveRef.done) {
                    resolveRef.done = true;
                    resolveRef.current(null);
                }
                modalProps.onClose();
            }

            return (
                <Modals.ModalRoot {...modalProps} size="small">
                    <Modals.ModalHeader>
                        <Modals.ModalCloseButton onClick={cancel} />
                        <h2 style={{ flex: 1, fontSize: 16, fontWeight: 700, color: "var(--white-500)" }}>
                            {title}
                        </h2>
                    </Modals.ModalHeader>
                    <Modals.ModalContent style={{ padding: "16px 20px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <label style={{ fontSize: 12, fontWeight: 600, color: "#fff", textTransform: "uppercase", letterSpacing: ".04em" }}>
                                {t("Nombre (max")}{" "}{max})
                            </label>
                            <input
                                autoFocus
                                type="number"
                                min={1}
                                max={max}
                                value={value}
                                onChange={e => setValue(e.currentTarget.value)}
                                onKeyDown={e => { if (e.key === "Enter") confirm(); }}
                                style={{
                                    background: "var(--background-secondary)",
                                    border: "1px solid var(--background-modifier-accent)",
                                    borderRadius: 4,
                                    color: "#fff",
                                    fontSize: 16,
                                    padding: "8px 12px",
                                    width: "100%",
                                    outline: "none",
                                }}
                            />
                        </div>
                    </Modals.ModalContent>
                    <Modals.ModalFooter>
                        <button
                            onClick={confirm}
                            disabled={!valid}
                            style={{
                                background: valid ? "var(--brand-experiment)" : "var(--button-secondary-background)",
                                border: "none", borderRadius: 4,
                                color: "var(--white-500)",
                                cursor: valid ? "pointer" : "not-allowed",
                                fontSize: 14, fontWeight: 500,
                                padding: "8px 20px",
                            }}
                        >
                            {t("Confirm")}</button>
                        <button
                            onClick={cancel}
                            style={{
                                background: "transparent", border: "none",
                                color: "var(--text-muted)",
                                cursor: "pointer", fontSize: 14,
                                padding: "8px 16px",
                            }}
                        >
                            {t("Cancel")}</button>
                    </Modals.ModalFooter>
                </Modals.ModalRoot>
            );
        }

        openModal(modalProps => <CountModal modalProps={modalProps} />);
    });
}

// ── Candidats d'un serveur ────────────────────────────────────────────────────
async function fetchAllGuildMembers(guildId: string): Promise<void> {
    const queries = [
        ..."abcdefghijklmnopqrstuvwxyz0123456789".split(""),
        ..."!@#$%^&*_-+=.[]{}".split(""),
    ];

    const before = (GuildMemberStore.getMemberIds(guildId)).length;

    for (const q of queries) {
        FluxDispatcher.dispatch({
            type: "GUILD_MEMBERS_REQUEST",
            guildIds: [guildId],
            query: q,
            limit: 100,
        });
        await new Promise(r => setTimeout(r, 80));
    }

    await new Promise(r => setTimeout(r, 1000));

    const after = (GuildMemberStore.getMemberIds(guildId)).length;
    const loaded = after - before;
    console.debug(`[FakeFriends] ${after} members in cache (${loaded > 0 ? `+${loaded}` : "already loaded"})`);
    showToast({ text: `${after} members available`, variant: "success" });
}

function getGuildCandidates(guildId: string): string[] {
    const me = UserStore.getCurrentUser()?.id;
    const memberIds: string[] = (GuildMemberStore.getMemberIds(guildId)) ?? [];
    const realRelNone = (id: string) => {
        const fn = origGetRelType ?? ((uid: string) => (RelationshipStore as any).getRelationshipType(uid));
        return fn.call(RelationshipStore, id) === RelationshipType.NONE;
    };
    return memberIds.filter(id => {
        if (id === me || !realRelNone(id)) return false;
        const cached = UserStore.getUser(id) as any;
        if (cached && isBot(cached)) return false;
        return true;
    });
}

// ── Fake Friend Request avec saisie du nombre ─────────────────────────────────
async function floodGuild(guildId: string) {
    showToast({ text: "Loading members...", variant: "default" });
    await fetchAllGuildMembers(guildId);

    const candidates = getGuildCandidates(guildId);
    if (!candidates.length) {
        showToast({ text: "No candidates available", variant: "critical" });
        return;
    }

    const count = await askCount("How many fake friend requests to send?", 99999);
    if (!count) return;

    const shuffled = [...candidates].sort(() => Math.random() - 0.5);
    const pool: string[] = [];
    while (pool.length < count) pool.push(...shuffled);
    const selected = pool.slice(0, count);
    const BATCH = 10;
    let sent = 0;
    for (let i = 0; i < selected.length; i += BATCH) {
        const batch = selected.slice(i, i + BATCH);
        const users = await Promise.all(batch.map(id => loadUser(id)));
        for (const user of users) {
            if (!user || isBot(user)) continue;
            await addPendingRequest(user);
            sent++;
        }
        await new Promise(r => setTimeout(r, 60));
    }
    showToast({ text: `${sent} fake friend request${sent > 1 ? "s" : ""} sent!`, variant: "success" });
}

// ── Remove fake requests pour un serveur ──────────────────────────────────────
async function removeFakeFriendsForGuild(guildId: string) {
    const memberIds = new Set<string>(GuildMemberStore.getMemberIds(guildId));
    const toRemove = [...fakeState.keys()].filter(id => memberIds.has(id));

    if (!toRemove.length) {
        showToast({ text: "No fake requests to remove for this server", variant: "default" });
        return;
    }

    for (const id of toRemove) {
        fakeState.delete(id);
        try {
            FluxDispatcher.dispatch({ type: "RELATIONSHIP_REMOVE", relationship: { id } });
        } catch { }
    }
    await persistState();
    showToast({ text: `${toRemove.length} fake request${toRemove.length > 1 ? "s" : ""} removed!`, variant: "success" });
}

const MessageRequestStoreLazy = findStoreLazy("MessageRequestStore");
let MessageRequestStore: any = null;
let origGetIds: Function | null = null;
let origGetCount: Function | null = null;
let origIsRequest: Function | null = null;

const fakeMessageRequests = new Map<string, { user: any; channelId: string; msgId: string; timestamp: string; }>();

function patchMessageRequestStore() {
    if (MessageRequestStore) return;
    try {
        // Discord's MessageRequestStore: channel id set, count and per-channel check.
        const store = MessageRequestStoreLazy;
        if (typeof store?.getMessageRequestChannelIds !== "function") return;
        MessageRequestStore = store;

        origGetIds = store.getMessageRequestChannelIds;
        store.getMessageRequestChannelIds = function () {
            const real = origGetIds!.call(this) as Set<string>;
            if (!fakeMessageRequests.size) return real;
            const merged = new Set(real);
            for (const channelId of fakeMessageRequests.keys()) merged.add(channelId);
            return merged;
        };

        origGetCount = store.getMessageRequestsCount;
        store.getMessageRequestsCount = function () {
            return store.getMessageRequestChannelIds().size;
        };

        origIsRequest = store.isMessageRequest;
        store.isMessageRequest = function (channelId: string) {
            if (fakeMessageRequests.has(channelId)) return true;
            return origIsRequest!.call(this, channelId);
        };
    } catch (e) {
        console.warn("[FF] patchMessageRequestStore:", e);
    }
}

function unpatchMessageRequestStore() {
    if (!MessageRequestStore) return;
    if (origGetIds) MessageRequestStore.getMessageRequestChannelIds = origGetIds;
    if (origGetCount) MessageRequestStore.getMessageRequestsCount = origGetCount;
    if (origIsRequest) MessageRequestStore.isMessageRequest = origIsRequest;
    origGetIds = origGetCount = origIsRequest = null;
    MessageRequestStore = null;
}

// ── Context menus ──────────────────────────────────────────────────────────────
const userContextPatch: NavContextMenuPatchCallback = (children, props) => {
    if (!children || !Array.isArray(children)) return;
    try {
        const userId = props?.user?.id ?? props?.userId;
        if (!userId || userId === UserStore.getCurrentUser()?.id) return;

        const state = fakeState.get(userId);
        const realRel = origGetRelType
            ? origGetRelType.call(RelationshipStore, userId)
            : (RelationshipStore as any).getRelationshipType(userId);

        if (!state && realRel !== RelationshipType.NONE) return;

        const followIndex = children.findIndex((c: any) =>
            c?.props?.id === "follow-user" || c?.key === "follow-user"
        );

        let items: React.ReactElement[] = [];
        if (!state) {
            items = [
                <Menu.MenuItem key="ff-friend" id="ff-friend" label={t("Fake Friend")} action={() => doFakeFriend(userId)} />,
                <Menu.MenuItem key="ff-request" id="ff-request" label={t("Fake Friend Request")} action={() => doFakeFriendRequest(userId)} />,
            ];
        } else if (state === "pending") {
            items = [
                <Menu.MenuItem key="ff-cancel" id="ff-cancel" label={t("Cancel the fake request")} color="danger"
                    action={async () => {
                        fakeState.delete(userId);
                        await persistState();
                        FluxDispatcher.dispatch({ type: "RELATIONSHIP_REMOVE", relationship: { id: userId } });
                    }} />
            ];
        } else {
            items = [
                <Menu.MenuItem key="ff-remove" id="ff-remove" label={t("Remove from fake friends")} color="danger"
                    action={async () => {
                        fakeState.delete(userId);
                        await persistState();
                        FluxDispatcher.dispatch({ type: "RELATIONSHIP_REMOVE", relationship: { id: userId } });
                    }} />
            ];
        }

        const group = <Menu.MenuGroup key="ff-group" label={t("Fake Friends")}>{items}</Menu.MenuGroup>;

        if (followIndex !== -1) children.splice(followIndex + 1, 0, group);
        else children.push(<Menu.MenuSeparator key="ff-sep" />, group);
    } catch (e) {
        console.error("[FakeFriends] Context menu patch error:", e);
    }
};

const guildContextPatch: NavContextMenuPatchCallback = (children, props) => {
    if (!children || !Array.isArray(children)) return;
    try {
        const guildId = props?.guild?.id ?? props?.guildId;
        if (!guildId) return;

        // Compter combien de fake states concernent ce serveur
        const memberIds = new Set<string>(GuildMemberStore.getMemberIds(guildId));
        const fakeCount = [...fakeState.keys()].filter(id => memberIds.has(id)).length;

        const items = [
            <Menu.MenuItem key="ff-g-flood" id="ff-g-flood" label={t("Fake Friend Request")}
                action={() => floodGuild(guildId)} />
        ];

        // Bouton "Remove fake friend requests" — visible seulement si des fakes existent pour ce serveur
        if (fakeCount > 0) {
            items.push(
                <Menu.MenuItem
                    key="ff-g-remove"
                    id="ff-g-remove"
                    label={`Remove fake friend requests (${fakeCount})`}
                    color="danger"
                    action={() => removeFakeFriendsForGuild(guildId)}
                />
            );
        }

        children.push(
            <Menu.MenuSeparator key="ff-g-sep" />,
            <Menu.MenuGroup key="ff-g-group" label={t("Fake Friends")}>{items}</Menu.MenuGroup>
        );
    } catch (e) {
        console.error("[FakeFriends] Guild context menu patch error:", e);
    }
};

// ── Plugin ─────────────────────────────────────────────────────────────────────
export default definePlugin({
    name: "FakeFriends",
    enabledByDefault: false,
    description: "Locally simulates Discord friends and requests. Persistent between reloads.",
    authors: [Devs.vpg],
    dependencies: ["ContextMenuAPI"],

    async start() {
        patchStore();
        patchChannelStore();
        patchAcceptFriend();
        patchMessageRequestStore();
        addContextMenuPatch("user-context", userContextPatch);
        addContextMenuPatch("guild-context", guildContextPatch);

        // Charger l'état persistant puis réappliquer les dispatches
        await loadState();
        if (fakeState.size > 0) {
            // Délai pour laisser Discord se charger complètement
            setTimeout(() => reapplyFakeStates(), 3000);
        }
    },

    stop() {
        removeContextMenuPatch("user-context", userContextPatch);
        removeContextMenuPatch("guild-context", guildContextPatch);
        unpatchAcceptFriend();
        // On ne clear pas fakeState au stop — persistant intentionnellement
        // Pour reset : clic Reset dans le plugin ou "Remove fake friend requests"
        unpatchStore();
        unpatchChannelStore();
        unpatchMessageRequestStore();
    },
});
