/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./StarterPacks.css?screen";

import { getStarterPacks, StarterPack } from "@api/PluginProfiles";
import { classNameFactory } from "@utils/css";
import { useI18n } from "@utils/i18n";
import { useMemo } from "@webpack/common";
import type { CSSProperties } from "react";

const cl = classNameFactory("ec-packs-");

/** The packs that have something in this build, in their order */
export const useStarterPacks = () => useMemo(() => getStarterPacks().filter(pack => pack.plugins.length), []);

interface StarterPackPickerProps {
    packs: StarterPack[];
    selected: ReadonlySet<string>;
    onToggle(id: string): void;
}

export function StarterPackPicker({ packs, selected, onToggle }: StarterPackPickerProps) {
    const { t } = useI18n();

    return (
        <div className={cl("grid")}>
            {packs.map(({ id, name, description, Icon, plugins, recommended }, index) => {
                const isSelected = selected.has(id);

                return (
                    <button
                        key={id}
                        className={cl("pack", { selected: isSelected, recommended })}
                        // Its place, for screens that bring the packs in one after another
                        style={{ "--ec-i": index } as CSSProperties}
                        aria-pressed={isSelected}
                        title={plugins.join(", ")}
                        onClick={() => onToggle(id)}
                    >
                        <span className={cl("head")}>
                            <span className={cl("icon")}><Icon width={20} height={20} /></span>
                            <span className={cl("name")}>{t(name)}</span>
                            {recommended && <span className={cl("tag")}>{t("Recommended")}</span>}
                            <span className={cl("check")} aria-hidden="true">
                                <svg viewBox="0 0 16 16"><path d="m4 8.5 2.5 2.5 5.5-6" /></svg>
                            </span>
                        </span>
                        <span className={cl("description")}>{t(description)}</span>
                        <span className={cl("count")}>{t("{count} plugins", { count: plugins.length })}</span>
                    </button>
                );
            })}
        </div>
    );
}
