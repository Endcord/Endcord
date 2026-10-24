/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { FormSwitch } from "@components/FormSwitch";
import { classNameFactory } from "@utils/css";
import { useI18n } from "@utils/i18n";
import { identity } from "@utils/misc";
import { GuildStore, IconUtils, React, Select, SortedGuildStore, useMemo, useState } from "@webpack/common";

import { FocusIcon, getMutedServers, setMutedServers, settings, toggle, useFocusState } from ".";

const cl = classNameFactory("ec-focus-");

function StatusCard() {
    const { t } = useI18n();
    const state = useFocusState();
    const since = state.since ? new Date(state.since).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
    const detail = state.active
        ? state.by === "schedule"
            ? t("On since {time}, started by your schedule", { time: since })
            : t("On since {time}", { time: since })
        : t("Turning it on changes only what you pick below, and turning it off puts it all back.");

    return (
        <div className={cl("status", state.active && "status-on")}>
            <div className={cl("status-icon")}><FocusIcon active={state.active} width={28} height={28} /></div>
            <div className={cl("status-text")}>
                <div className={cl("status-title")}>{state.active ? t("Focus Mode is on") : t("Focus Mode is off")}</div>
                <div className={cl("status-detail")}>{detail}</div>
            </div>
            <button className={cl("toggle", state.active && "toggle-on")} onClick={toggle}>
                {state.active ? t("Turn off") : t("Turn on")}
            </button>
        </div>
    );
}

function ServerPicker() {
    const { t } = useI18n();
    const [query, setQuery] = useState("");
    const [selected, setSelected] = useState(() => new Set(getMutedServers()));

    const guilds = useMemo(() =>
        SortedGuildStore.getFlattenedGuildIds()
            .map(id => GuildStore.getGuild(id))
            .filter(Boolean),
    []);
    const shown = query ? guilds.filter(g => g.name.toLowerCase().includes(query.toLowerCase())) : guilds;

    const flip = (id: string) => {
        const next = new Set(selected);
        if (!next.delete(id)) next.add(id);
        setSelected(next);
        setMutedServers([...next]);
    };

    return (
        <section className={cl("section")}>
            <h3 className={cl("heading")}>{t("Mute these servers")}</h3>
            <p className={cl("hint")}>{t("Muted only while Focus Mode is on. Servers you had already muted stay muted afterwards.")}</p>
            <input className={cl("search")} placeholder={t("Search servers")} value={query} onChange={e => setQuery(e.currentTarget.value)} />
            <div className={cl("servers")} role="list">
                {shown.map(g => {
                    const icon = IconUtils.getGuildIconURL({ id: g.id, icon: g.icon, size: 32 });
                    const on = selected.has(g.id);
                    return (
                        <button key={g.id} role="listitem" className={cl("server", on && "server-on")} onClick={() => flip(g.id)} aria-pressed={on}>
                            {icon
                                ? <img className={cl("server-icon")} src={icon} alt="" />
                                : <span className={cl("server-icon", "server-acronym")}>{g.name.split(/\s+/).map(w => w[0]).join("").slice(0, 3)}</span>}
                            <span className={cl("server-name")}>{g.name}</span>
                            <span className={cl("check")} aria-hidden="true" />
                        </button>
                    );
                })}
                {!shown.length && <p className={cl("hint")}>{t("No servers match your search.")}</p>}
            </div>
        </section>
    );
}

function TimeInput({ label, settingKey }: { label: string; settingKey: "scheduleStart" | "scheduleEnd"; }) {
    const value = settings.use([settingKey])[settingKey];
    return (
        <label className={cl("time")}>
            <span>{label}</span>
            <input type="time" value={value} onChange={e => settings.store[settingKey] = e.currentTarget.value} />
        </label>
    );
}

function Options() {
    const { t } = useI18n();
    const s = settings.use(["status", "silenceNotifications", "allowDirectMessages", "hideUnreadBadges", "scheduleEnabled"]);

    return (
        <>
            <section className={cl("section")}>
                <h3 className={cl("heading")}>{t("Status")}</h3>
                <Select
                    options={[
                        { label: t("Do Not Disturb"), value: "dnd" },
                        { label: t("Invisible"), value: "invisible" },
                        { label: t("Idle"), value: "idle" },
                        { label: t("Keep my current status"), value: "keep" },
                    ]}
                    isSelected={v => v === s.status}
                    select={v => s.status = v}
                    serialize={identity}
                    closeOnSelect
                />
            </section>

            <section className={cl("section")}>
                <h3 className={cl("heading")}>{t("While Focus Mode is on")}</h3>
                <FormSwitch title={t("Block desktop notifications and their sounds")} value={s.silenceNotifications} onChange={v => s.silenceNotifications = v} />
                <FormSwitch title={t("Still notify me about direct messages")} value={s.allowDirectMessages} disabled={!s.silenceNotifications} onChange={v => s.allowDirectMessages = v} />
                <FormSwitch title={t("Hide unread and mention badges")} value={s.hideUnreadBadges} onChange={v => s.hideUnreadBadges = v} hideBorder />
            </section>

            <section className={cl("section")}>
                <FormSwitch
                    title={t("Turn on automatically at set times")}
                    description={t("Turning it off by hand during the scheduled time keeps it off until the time is over.")}
                    value={s.scheduleEnabled}
                    onChange={v => s.scheduleEnabled = v}
                    hideBorder
                />
                {s.scheduleEnabled && (
                    <div className={cl("times")}>
                        <TimeInput label={t("From")} settingKey="scheduleStart" />
                        <TimeInput label={t("Until")} settingKey="scheduleEnd" />
                    </div>
                )}
            </section>
        </>
    );
}

export function FocusPanel({ inSettings }: { inSettings?: boolean; }) {
    return (
        <div className={cl("panel")}>
            <StatusCard />
            {!inSettings && <Options />}
            <ServerPicker />
        </div>
    );
}
