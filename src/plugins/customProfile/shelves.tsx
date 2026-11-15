/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, useI18n } from "@utils/i18n";
import { LazyComponent } from "@utils/lazyReact";
import { IconUtils, React, Select } from "@webpack/common";

export interface ShelfItem {
    id: string;
    label: string;
    art: React.ReactNode;
}

/**
 * One shop section: None plus every item. Memoised, so its hundreds of images only re-render when it opens or its
 * selection changes, not on every keystroke in a field above
 */
export const Shelf = LazyComponent(() => React.memo(function Shelf({ items, picked, onPick, kind }: { items: ShelfItem[]; picked?: string; onPick(id?: string): void; kind: string; }) {
    return (
        <div className="cp-badges cp-effects">
            <button onClick={() => onPick(undefined)} className={`cp-badge ${!picked ? "cp-badge--on" : ""}`} style={{ minWidth: 60 }}>
                {t("None")}
            </button>
            {items.map(item => (
                <button key={item.id} onClick={() => onPick(picked === item.id ? undefined : item.id)} title={item.label}
                    className={`cp-badge ${kind} ${picked === item.id ? "cp-badge--on" : ""}`}>
                    {item.art}
                </button>
            ))}
        </div>
    );
}));

// Account picker in the header, kept out of the keystroke re-renders
export const AccountPicker = LazyComponent(() => React.memo(function AccountPicker({ accounts, selected, onSelect }: { accounts: any[]; selected: string; onSelect(id: string): void; }) {
    const { t } = useI18n();
    const avatarOf = (id: string) => {
        const acc = accounts.find((a: any) => a.id === id);
        try { if (acc && IconUtils?.getUserAvatarURL) return IconUtils.getUserAvatarURL(acc, false, 20); } catch { }
        return "";
    };
    const withAvatar = (id: string, label: string) => {
        const avatarUrl = avatarOf(id);
        return (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {avatarUrl ? <img src={avatarUrl} style={{ borderRadius: "50%", width: 20, height: 20 }} /> : null}
                {label}
            </div>
        );
    };

    return (
        <Select
            options={accounts.map((acc: any) => ({
                value: acc.id,
                label: acc.globalName || acc.username,
            }))}
            isSelected={(v: string) => v === selected}
            select={onSelect}
            serialize={(v: string) => v}
            renderOptionLabel={(o: any) => withAvatar(o.value, o.label)}
            renderOptionValue={(chosen: any[]) => chosen[0] ? withAvatar(chosen[0].value, chosen[0].label) : t("Select Account")}
        />
    );
}));
