/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { EndcordModal } from "@components/EndcordModal";
import type { Guild } from "@endcord/discord-types";
import { Devs } from "@utils/constants";
import { t } from "@utils/i18n";
import { openModal } from "@utils/modal";
import definePlugin, { OptionType } from "@utils/types";
import { findStoreLazy } from "@webpack";
import { GuildStore, Menu, React, RestAPI, TextInput, useState } from "@webpack/common";

const GuildMemberCountStore = findStoreLazy("GuildMemberCountStore");
const GuildSettingsStore = findStoreLazy("GuildSettingsStore");
const GuildProfileStore = findStoreLazy("GuildProfileStore");
const InviteStore = findStoreLazy("InviteStore");
const ChannelMemberStore = findStoreLazy("ChannelMemberStore");

interface FakeLook {
    verified?: boolean;
    partnered?: boolean;
    members?: number;
    online?: number;
}

const settings = definePluginSettings({
    servers: {
        type: OptionType.CUSTOM,
        description: "What each server shows, by its id",
        default: {} as Record<string, FakeLook>
    }
});

const lookOf = (guildId: string | null | undefined): FakeLook | undefined => guildId ? settings.store.servers[guildId] : undefined;

function setLook(guildId: string, change: Partial<FakeLook>) {
    const next = { ...settings.store.servers[guildId], ...change };
    const servers = { ...settings.store.servers };
    // A server back to how Discord shows it needs no entry
    if (!next.verified && !next.partnered && next.members == null && next.online == null) delete servers[guildId];
    else servers[guildId] = next;
    settings.store.servers = servers;
    refresh();
}

function refresh() {
    for (const store of [GuildStore as any, GuildMemberCountStore, GuildSettingsStore, GuildProfileStore, InviteStore, ChannelMemberStore]) {
        try {
            store?.emitChange();
        } catch { }
    }
}

const FAKE_FEATURES = ["VERIFIED", "PARTNERED"];

const extraFeatures = (look: FakeLook) => FAKE_FEATURES.filter(f => f === "VERIFIED" ? look.verified : look.partnered);

/** A server's features with the fake ones added, as the same kind of collection Discord gave (a Set or a list) */
function addFeatures(features: Set<string> | string[] | undefined, look: FakeLook): any {
    const extra = extraFeatures(look);
    if (Array.isArray(features)) return [...new Set([...features, ...extra])];
    return new Set([...(features ?? []), ...extra]);
}

const hasBadges = (look: FakeLook | undefined): look is FakeLook => !!look && (!!look.verified || !!look.partnered);

/** For Discord's server badge, whatever server record it was handed */
function featuresOf(guild: { id?: string; features?: Set<string> | string[]; } | null | undefined) {
    const look = lookOf(guild?.id);
    const features = guild?.features ?? [];
    return hasBadges(look) ? addFeatures(features, look) : features;
}

// Discord compares what its stores return by reference, so each stand-in is made once and kept until Discord
// replaces the original or the look changes. A new one on every read would make Discord re-render forever
const standIns = new WeakMap<object, { key: string; value: any; }>();

function keep<T>(original: object, look: unknown, make: () => T): T {
    const key = JSON.stringify(look);
    const kept = standIns.get(original);
    if (kept?.key === key) return kept.value;
    const value = make();
    standIns.set(original, { key, value });
    return value;
}

/** A copy that keeps the original's class, so its methods (like hasFeature) still work */
function cloneRecord<T extends object>(original: T, changes: Record<string, any>): T {
    const copy = Object.create(Object.getPrototypeOf(original));
    for (const name of Object.getOwnPropertyNames(original)) {
        Object.defineProperty(copy, name, Object.getOwnPropertyDescriptor(original, name)!);
    }
    return Object.assign(copy, changes);
}

function withFeatures(guild: Guild, look: FakeLook): Guild {
    return keep(guild, look, () => cloneRecord(guild, { features: addFeatures(guild.features as any, look) }));
}

/** The server card (the popout from a server tag, the server profile): badges and counts */
function withProfile(profile: any, look: FakeLook) {
    return keep(profile, look, () => ({
        ...profile,
        ...(hasBadges(look) && { features: addFeatures(profile.features ?? [], look) }),
        ...(look.members != null && { memberCount: look.members }),
        ...(look.online != null && { onlineCount: look.online })
    }));
}

/** An invite to the server, as its card in chat shows it */
function withInvite(invite: any, look: FakeLook) {
    return keep(invite, look, () => ({
        ...invite,
        ...(hasBadges(look) && invite.guild && { guild: { ...invite.guild, features: addFeatures(invite.guild.features ?? [], look) } }),
        ...(look.members != null && { approximate_member_count: look.members }),
        ...(look.online != null && { approximate_presence_count: look.online })
    }));
}

/**
 * The member list's group headers ("Online — 12"). The online group shows the fake online count, the offline
 * group the rest of the fake member count
 */
function withMemberList(props: any, look: FakeLook) {
    const groups: { id: string; count: number; }[] | undefined = props?.groups;
    if (!Array.isArray(groups) || look.members == null && look.online == null) return props;

    const counts = new Map<string, number>();
    const onlineGroups = groups.filter(g => g.id !== "offline");
    if (look.online != null && groups.some(g => g.id === "online")) {
        // Members shown under a role are online too
        const underRoles = onlineGroups.filter(g => g.id !== "online").reduce((sum, g) => sum + g.count, 0);
        counts.set("online", Math.max(look.online - underRoles, 0));
    }
    if (look.members != null && groups.some(g => g.id === "offline")) {
        const online = onlineGroups.reduce((sum, g) => sum + (counts.get(g.id) ?? g.count), 0);
        counts.set("offline", Math.max(look.members - online, 0));
    }
    if (!counts.size) return props;

    const fix = (item: any) => item && typeof item === "object" && counts.has(item.id) && typeof item.count === "number"
        ? { ...item, count: counts.get(item.id) }
        : item;

    return {
        ...props,
        groups: keep(groups, look, () => groups.map(fix)),
        rows: Array.isArray(props.rows)
            ? keep(props.rows, look, () => props.rows.map((row: any) => row?.type === "GROUP" ? fix(row) : row))
            : props.rows
    };
}

const restores: (() => void)[] = [];
let realGetGuild: ((id: string) => Guild | undefined) | undefined;

function wrap(store: any, method: string, make: (original: (...args: any[]) => any) => (...args: any[]) => any) {
    const original = store?.[method];
    if (typeof original !== "function") return;
    const wrapped = make(original);
    try {
        store[method] = wrapped;
    } catch {
        return;
    }
    if (store[method] !== wrapped) return;
    restores.push(() => {
        if (store[method] === wrapped) store[method] = original;
    });
}

const toCount = (text: string) => {
    const digits = text.replace(/[^\d]/g, "");
    return digits ? Math.min(Number(digits), 99_999_999) : undefined;
};

function MemberCountModal({ guildId, name, ...props }: { guildId: string; name: string; transitionState: any; onClose(): void; }) {
    const look = lookOf(guildId);
    const [members, setMembers] = useState(look?.members?.toString() ?? "");
    const [online, setOnline] = useState(look?.online?.toString() ?? "");

    const save = () => {
        setLook(guildId, { members: toCount(members), online: toCount(online) });
        props.onClose();
    };

    return (
        <EndcordModal
            {...props}
            size="sm"
            title={t("Member count for {name}", { name })}
            subtitle={t("Only you see these numbers. Leave a box empty to show the real one.")}
            actions={[
                { text: t("Cancel"), variant: "secondary", onClick: props.onClose },
                { text: t("Save"), variant: "primary", onClick: save }
            ]}
        >
            <form onSubmit={e => { e.preventDefault(); save(); }} style={{ display: "grid", gap: 12 }}>
                <label>
                    {t("Members")}
                    <TextInput value={members} onChange={setMembers} placeholder="250000" inputMode="numeric" autoFocus />
                </label>
                <label>
                    {t("Online")}
                    <TextInput value={online} onChange={setOnline} placeholder="48000" inputMode="numeric" />
                </label>
            </form>
        </EndcordModal>
    );
}

const guildContext: NavContextMenuPatchCallback = (children, { guild }: { guild?: Guild; }) => {
    if (!guild) return;
    const look = lookOf(guild.id) ?? {};

    children.push(
        <Menu.MenuItem id="ec-fake-server" key="ec-fake-server" label={t("Fake server look")}>
            <Menu.MenuCheckboxItem
                id="ec-fake-server-verified"
                label={t("Verified")}
                checked={!!look.verified}
                action={() => setLook(guild.id, { verified: !look.verified })}
            />
            <Menu.MenuCheckboxItem
                id="ec-fake-server-partnered"
                label={t("Partnered")}
                checked={!!look.partnered}
                action={() => setLook(guild.id, { partnered: !look.partnered })}
            />
            <Menu.MenuItem
                id="ec-fake-server-members"
                label={t("Member count...")}
                action={() => openModal(props => <MemberCountModal {...props} guildId={guild.id} name={guild.name} />)}
            />
            {lookOf(guild.id) && (
                <Menu.MenuItem
                    id="ec-fake-server-reset"
                    label={t("Show it as it is")}
                    color="danger"
                    action={() => setLook(guild.id, { verified: false, partnered: false, members: undefined, online: undefined })}
                />
            )}
        </Menu.MenuItem>
    );
};

export default definePlugin({
    name: "FakeServer",
    description: "Make any server look verified or partnered, with as many members as you like. Right click a server. Only on your screen.",
    tags: ["Fun", "Servers"],
    authors: [Devs.rootpoi],
    settings,

    contextMenus: {
        "guild-context": guildContext
    },

    patches: [
        {
            // The badge next to a server's name, wherever Discord draws it: header, settings, popouts, invites
            find: ".INTERNAL_EMPLOYEE_ONLY)?this.renderBadge(",
            replacement: {
                match: /(render\(\){let{guild:(\i)}=this\.props,\i=new Set\()\i\.features\)/,
                replace: "$1$self.featuresOf($2))"
            }
        }
    ],

    featuresOf,

    start() {
        realGetGuild = GuildStore.getGuild.bind(GuildStore);

        wrap(GuildStore, "getGuild", original => function (this: unknown, guildId: string) {
            const guild = original.call(this, guildId);
            const look = guild && lookOf(guildId);
            return hasBadges(look) ? withFeatures(guild, look) : guild;
        });
        // Server settings keep their own copy of the server
        wrap(GuildSettingsStore, "getGuild", original => function (this: unknown) {
            const guild = original.call(this);
            const look = guild && lookOf(guild.id);
            return hasBadges(look) ? withFeatures(guild, look) : guild;
        });
        wrap(GuildProfileStore, "getProfile", original => function (this: unknown, guildId: string) {
            const profile = original.call(this, guildId);
            const look = profile && lookOf(guildId);
            return look ? withProfile(profile, look) : profile;
        });
        wrap(InviteStore, "getInvite", original => function (this: unknown, code: string) {
            const invite = original.call(this, code);
            const look = invite?.guild && lookOf(invite.guild.id);
            return look ? withInvite(invite, look) : invite;
        });
        wrap(ChannelMemberStore, "getProps", original => function (this: unknown, guildId: string, channelId: string) {
            const props = original.call(this, guildId, channelId);
            const look = lookOf(guildId);
            return look ? withMemberList(props, look) : props;
        });
        wrap(GuildMemberCountStore, "getMemberCount", original => function (this: unknown, guildId: string) {
            return lookOf(guildId)?.members ?? original.call(this, guildId);
        });
        wrap(GuildMemberCountStore, "getOnlineCount", original => function (this: unknown, guildId: string) {
            return lookOf(guildId)?.online ?? original.call(this, guildId);
        });
        wrap(GuildMemberCountStore, "getMemberCounts", original => function (this: unknown) {
            const counts = original.call(this);
            const fakes = Object.entries(settings.store.servers).filter(([, look]) => look.members != null);
            if (!counts || !fakes.length) return counts;
            return keep(counts, fakes, () => ({ ...counts, ...Object.fromEntries(fakes.map(([id, look]) => [id, look.members])) }));
        });

        // Saving server settings sends the server's features back to Discord. The fake ones never go with them
        wrap(RestAPI, "patch", original => function (this: unknown, request: any) {
            const id = typeof request?.url === "string" && /^\/guilds\/(\d+)$/.exec(request.url)?.[1];
            const features = request?.body?.features;
            // Another plugin may wrap this after us and keep calling it once we're stopped: then it just passes through
            if (id && Array.isArray(features) && realGetGuild) {
                const real: any = realGetGuild?.(id)?.features;
                const realHas = (f: string) => real instanceof Set ? real.has(f) : Array.isArray(real) && real.includes(f);
                request = { ...request, body: { ...request.body, features: features.filter((f: string) => !FAKE_FEATURES.includes(f) || realHas(f)) } };
            }
            return original.call(this, request);
        });
        refresh();
    },

    stop() {
        restores.splice(0).forEach(restore => restore());
        realGetGuild = undefined;
        refresh();
    }
});
