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
import { Unwrap, wrapMethod } from "@utils/wrapMethod";
import { findByPropsLazy, findStoreLazy } from "@webpack";
import { ChannelStore, FluxDispatcher, GuildMemberStore, Menu, React, RelationshipStore, showToast, UserStore, UserUtils } from "@webpack/common";

// In memory only, so the fakes are gone after a restart. That's on purpose
const fakeState = new Map<string, "pending" | "accepted">();

async function persistState() {
    // Nothing to save
}

async function loadState() {
    // Nothing to load
}

// ---- RelationshipStore ----
// Through wrapMethod: SurfaceTranslate and others wrap the same stores, and putting a method back by hand on stop
// brought back their wrappers in the wrong order, or wrapped one of ours twice so it called itself
const unwrapStore: Unwrap<any>[] = [];
let realRelationshipType: ((userId: string) => number) | null = null;

function wrapIfThere<T extends object>(list: Unwrap<any>[], obj: T, key: keyof T, wrapper: any) {
    if (typeof obj?.[key] !== "function") return null;
    const unwrap = wrapMethod(obj, key, wrapper);
    list.push(unwrap);
    return unwrap;
}

function patchStore() {
    if (unwrapStore.length) return;
    const store = RelationshipStore as any;
    const relType = wrapIfThere(unwrapStore, store, "getRelationshipType", function (this: any, original: any, userId: string) {
        const s = fakeState.get(userId);
        if (s === "accepted") return RelationshipType.FRIEND;
        if (s === "pending") return RelationshipType.INCOMING_REQUEST;
        return original.call(this, userId);
    });
    realRelationshipType = relType ? relType.original : null;
    wrapIfThere(unwrapStore, store, "isFriend", function (this: any, original: any, userId: string) {
        if (fakeState.get(userId) === "accepted") return true;
        return original.call(this, userId);
    });
    wrapIfThere(unwrapStore, store, "getFriendIDs", function (this: any, original: any) {
        const real: string[] = original.call(this);
        const extra = [...fakeState.entries()].filter(([, s]) => s === "accepted").map(([id]) => id);
        return [...new Set([...real, ...extra])];
    });
    wrapIfThere(unwrapStore, store, "getMutableRelationships", function (this: any, original: any) {
        const real = original.call(this);
        for (const [id, s] of fakeState) {
            if (s === "accepted") real.set(id, RelationshipType.FRIEND);
            if (s === "pending") real.set(id, RelationshipType.INCOMING_REQUEST);
        }
        return real;
    });
}

function unpatchStore() {
    for (const unwrap of unwrapStore.splice(0)) unwrap();
    realRelationshipType = null;
}

/** What Discord itself says about someone, without the fake */
function realRelationship(userId: string): number {
    return realRelationshipType ? realRelationshipType(userId) : (RelationshipStore as any).getRelationshipType(userId);
}

// ---- acceptFriend ----
const RelationshipActions = findByPropsLazy("acceptFriendRequest", "cancelFriendRequest");
const unwrapAccept: Unwrap<any>[] = [];

function patchAcceptFriend() {
    if (unwrapAccept.length) return;
    try {
        // Discord passes { userId, ... }; older builds passed the id directly
        wrapIfThere(unwrapAccept, RelationshipActions, "acceptFriendRequest", async function (this: any, original: any, arg: any, ...args: any[]) {
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
            return original.call(this, arg, ...args);
        });
    } catch (e) { console.warn("[FF] patchAcceptFriend:", e); }
}

function unpatchAcceptFriend() {
    for (const unwrap of unwrapAccept.splice(0)) unwrap();
}

// ---- Helpers ----
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

// ---- Reapplying fakes at startup ----
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
const unwrapChannels: Unwrap<any>[] = [];

function patchChannelStore() {
    if (unwrapChannels.length) return;
    const store = ChannelStore as any;

    wrapIfThere(unwrapChannels, store, "getChannel", function (this: any, original: any, id: string) {
        if (fakeDMChannelObjects.has(id)) return fakeDMChannelObjects.get(id);
        return original.call(this, id);
    });

    wrapIfThere(unwrapChannels, store, "getDMFromUserId", function (this: any, original: any, userId: string) {
        for (const [cid, ch] of fakeDMChannelObjects) {
            if ((ch.recipientIDs ?? []).includes(userId)) return cid;
        }
        return original.call(this, userId);
    });

    wrapIfThere(unwrapChannels, store, "getSortedPrivateChannels", function (this: any, original: any) {
        const real = original.call(this) ?? [];
        return [...real, ...fakeDMChannelObjects.values()];
    });
}

function unpatchChannelStore() {
    for (const unwrap of unwrapChannels.splice(0)) unwrap();
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

// ---- Modal asking for a number ----
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

// ---- A server's candidates ----
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
    const realRelNone = (id: string) => realRelationship(id) === RelationshipType.NONE;
    return memberIds.filter(id => {
        if (id === me || !realRelNone(id)) return false;
        const cached = UserStore.getUser(id) as any;
        if (cached && isBot(cached)) return false;
        return true;
    });
}

// ---- Fake friend requests, with a count ----
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

// ---- Removing a server's fake requests ----
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
const unwrapRequests: Unwrap<any>[] = [];

const fakeMessageRequests = new Map<string, { user: any; channelId: string; msgId: string; timestamp: string; }>();

function patchMessageRequestStore() {
    if (unwrapRequests.length) return;
    try {
        // Discord's MessageRequestStore: channel id set, count and per-channel check.
        const store = MessageRequestStoreLazy;
        if (typeof store?.getMessageRequestChannelIds !== "function") return;

        wrapIfThere(unwrapRequests, store, "getMessageRequestChannelIds", function (this: any, original: any) {
            const real = original.call(this) as Set<string>;
            if (!fakeMessageRequests.size) return real;
            const merged = new Set(real);
            for (const channelId of fakeMessageRequests.keys()) merged.add(channelId);
            return merged;
        });

        wrapIfThere(unwrapRequests, store, "getMessageRequestsCount", function () {
            return store.getMessageRequestChannelIds().size;
        });

        wrapIfThere(unwrapRequests, store, "isMessageRequest", function (this: any, original: any, channelId: string) {
            if (fakeMessageRequests.has(channelId)) return true;
            return original.call(this, channelId);
        });
    } catch (e) {
        console.warn("[FF] patchMessageRequestStore:", e);
    }
}

function unpatchMessageRequestStore() {
    for (const unwrap of unwrapRequests.splice(0)) unwrap();
}

// ---- Context menus ----
const userContextPatch: NavContextMenuPatchCallback = (children, props) => {
    if (!children || !Array.isArray(children)) return;
    try {
        const userId = props?.user?.id ?? props?.userId;
        if (!userId || userId === UserStore.getCurrentUser()?.id) return;

        const state = fakeState.get(userId);
        const realRel = realRelationship(userId);

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

        // How many fakes belong to this server
        const memberIds = new Set<string>(GuildMemberStore.getMemberIds(guildId));
        const fakeCount = [...fakeState.keys()].filter(id => memberIds.has(id)).length;

        const items = [
            <Menu.MenuItem key="ff-g-flood" id="ff-g-flood" label={t("Fake Friend Request")}
                action={() => floodGuild(guildId)} />
        ];

        // "Remove fake friend requests", only when this server has any
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

// ---- Plugin ----
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

        // Load the saved state, then dispatch it again
        await loadState();
        if (fakeState.size > 0) {
            // Give Discord time to finish loading
            setTimeout(() => reapplyFakeStates(), 3000);
        }
    },

    stop() {
        removeContextMenuPatch("user-context", userContextPatch);
        removeContextMenuPatch("guild-context", guildContextPatch);
        unpatchAcceptFriend();
        // fakeState isn't cleared on stop, on purpose. To reset, use Reset in the plugin settings or
        // "Remove fake friend requests"
        unpatchStore();
        unpatchChannelStore();
        unpatchMessageRequestStore();
    },
});
