/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./PluginPickList.css?screen";

import { Switch } from "@components/Switch";
import { classNameFactory } from "@utils/css";
import { useI18n } from "@utils/i18n";

import Plugins from "~plugins";

const cl = classNameFactory("ec-pick-");

interface PluginPickListProps {
    names: string[];
    isOn(name: string): boolean;
    onChange(name: string, on: boolean): void;
}

/** Plugins by name and what they do, each with a switch. Showing the English description loads the plugin, not starts it */
export function PluginPickList({ names, isOn, onChange }: PluginPickListProps) {
    const { tPluginDesc } = useI18n();

    return (
        <ul className={cl("list")}>
            {names.map(name => (
                <li key={name}>
                    <label className={cl("row")}>
                        <span className={cl("text")}>
                            <span className={cl("name")}>{name}</span>
                            <span className={cl("description")}>{tPluginDesc(name, Plugins[name]?.description ?? "")}</span>
                        </span>
                        <Switch checked={isOn(name)} onChange={on => onChange(name, on)} />
                    </label>
                </li>
            ))}
        </ul>
    );
}
