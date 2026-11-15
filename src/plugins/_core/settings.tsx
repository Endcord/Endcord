/*
 * Endcord, a Discord client mod
 * Copyright (c) 2022 Vendicated and Megumin
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { getIsEndcordHidden } from "@api/EndcordVisibility";
import { definePluginSettings } from "@api/Settings";
import { BackupTabIcon, DiagnosticsTabIcon, EndcordLogoIcon, PatchHelperTabIcon, PluginsTabIcon, ThemesTabIcon, UpdaterTabIcon } from "@components/EndcordIcons";
import { PlaceholderIcon } from "@components/Icons";
import { BackupAndRestoreTab, DiagnosticsTab, EndcordTab, PatchHelperTab, PluginsTab, ThemesTab, UpdaterTab } from "@components/settings/tabs";
import { Devs } from "@utils/constants";
import { isTruthy } from "@utils/guards";
import { t } from "@utils/i18n";
import definePlugin, { IconProps, OptionType } from "@utils/types";
import { waitFor } from "@webpack";
import { React } from "@webpack/common";
import type { ComponentType, PropsWithChildren, ReactNode } from "react";

import gitHash from "~git-hash";

let LayoutTypes = {
    SECTION: 1,
    SIDEBAR_ITEM: 2,
    PANEL: 3,
    CATEGORY: 5,
    CUSTOM: 19,
};
waitFor(["SECTION", "SIDEBAR_ITEM", "PANEL", "CUSTOM"], v => LayoutTypes = v);

const FallbackSectionTypes = {
    HEADER: "HEADER",
    DIVIDER: "DIVIDER",
    CUSTOM: "CUSTOM"
};
type SectionTypes = typeof FallbackSectionTypes;

type SettingsLocation =
    | "top"
    | "aboveNitro"
    | "belowNitro"
    | "aboveActivity"
    | "belowActivity"
    | "bottom";

interface SettingsLayoutNode {
    type: number;
    key?: string;
    legacySearchKey?: string;
    getLegacySearchKey?(): string;
    useLabel?(): string;
    useTitle?(): string;
    buildLayout?(): SettingsLayoutNode[];
    icon?(): ReactNode;
    render?(): ReactNode;
    StronglyDiscouragedCustomComponent?(): ReactNode;
}

interface EntryOptions {
    key: string,
    title: string,
    panelTitle?: string,
    Component: ComponentType<{}>,
    Icon: ComponentType<IconProps>;
}
const GLIDE_SHOWN = "ec-side-lit";

/**
 * One hover highlight shared by Endcord's sidebar entries, sliding to whichever is under the pointer (like the
 * Control Center rows). Discord's own entries keep their hover. The highlight is a child of Discord's list, added
 * once; React leaves nodes it didn't create alone
 */
function glide(list: HTMLElement) {
    if (list.style.position) return;
    // New stacking context, so the highlight can sit under the entries
    list.style.cssText = "position:relative;isolation:isolate";

    // An empty <i>: nothing for a screen reader to read out, unlike a list item
    const light = list.insertBefore(document.createElement("i"), list.firstChild);
    light.className = "ec-glide";

    // Entries span the full width, so the highlight only moves vertically. Coming in from outside, it fades in at the
    // pointer instead of sliding there
    list.onpointerover = ({ target }) => {
        const link = (target as Element).closest<HTMLElement>("[data-ec-side]>[role=link]");
        if (!link) return;

        const shown = light.classList.contains(GLIDE_SHOWN);
        light.style.cssText = `transform:translateY(${link.offsetTop}px);height:${link.offsetHeight}px${shown ? "" : ";transition:none"}`;
        if (!shown) {
            void light.offsetHeight;
            light.style.transition = "";
            light.classList.add(GLIDE_SHOWN);
        }
    };
    list.onpointerleave = () => light.classList.remove(GLIDE_SHOWN);
}

/** Tags an entry as Endcord's (going by the icon it renders) for the highlight */
function markEntry(icon: HTMLElement | null) {
    const item = icon?.closest<HTMLElement>("[data-settings-sidebar-item]");
    if (!item?.parentElement) return;
    item.dataset.ecSide = "";
    glide(item.parentElement);
}

const SidebarIcon = ({ Icon }: { Icon: ComponentType<IconProps>; }) => <span ref={markEntry} className="ec-side-icon"><Icon width={20} height={20} /></span>;

interface SettingsLayoutBuilder {
    key?: string;
    buildLayout(): SettingsLayoutNode[];
}

const settings = definePluginSettings({
    settingsLocation: {
        type: OptionType.SELECT,
        get description() { return t("Where to put the Endcord settings section"); },
        get options() {
            return [
                { label: t("At the very top"), value: "top" },
                { label: t("Above the Nitro section"), value: "aboveNitro", default: true },
                { label: t("Below the Nitro section"), value: "belowNitro" },
                { label: t("Above Activity Settings"), value: "aboveActivity" },
                { label: t("Below Activity Settings"), value: "belowActivity" },
                { label: t("At the very bottom"), value: "bottom" },
            ] as { label: string; value: SettingsLocation; default?: boolean; }[];
        }
    },
    includeEndcordInfoWhenCopying: {
        type: OptionType.BOOLEAN,
        get description() { return t("Also copy Endcord info (Endcord, Electron, Chromium) when clicking the version info in the bottom left area of the Settings page"); },
        default: true
    }
});

export default definePlugin({
    name: "Settings",
    description: "Adds Settings UI and debug info",
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
    required: true,

    settings,

    patches: [
        {
            find: "#{intl::COPY_VERSION}",
            replacement: [
                {
                    match: /"(?:text-xxs|footnote)\/normal".{0,300}?(?=null!=(\i)&&(.{0,20}\i\.\i.{0,200}?,children:).{0,15}?("span"),{className:(\i\.\i),children:\["Build Override: ",\1\.id,\i\]\}\)\}\))/,
                    replace: (m, _buildOverride, makeRow, component, className) => {
                        return `${m},$self.makeInfoElements(${component},{className:${className}}).map(e=>${makeRow}e})),`;
                    }
                },
                {
                    match: /copyValue:\i\.join\(" "\)/g,
                    replace: "$& + $self.getInfoString()"
                }
            ]
        },
        {
            find: ".buildLayout().map",
            replacement: {
                match: /(\i)\.buildLayout\(\)(?=\.map)/,
                replace: "$self.buildLayout($1)"
            }
        }
    ],

    buildEntry(options: EntryOptions): SettingsLayoutNode {
        const { key, title, panelTitle = title, Component, Icon } = options;

        const panel: SettingsLayoutNode = {
            key: `${key}_panel`,
            type: LayoutTypes.PANEL,
            useTitle: () => t(panelTitle),
            buildLayout: () => [{
                type: LayoutTypes.CATEGORY,
                key: `${key}_category`,
                buildLayout: () => [{
                    type: LayoutTypes.CUSTOM,
                    key: `${key}_custom`,
                    Component,
                    useSearchTerms: () => [t(title), title]
                }]
            }]
        };

        return ({
            key,
            type: LayoutTypes.SIDEBAR_ITEM,
            useTitle: () => t(title),
            icon: () => <SidebarIcon Icon={Icon} />,
            buildLayout: () => [panel]
        });
    },

    buildLayout(originalLayoutBuilder: SettingsLayoutBuilder) {
        const layout = originalLayoutBuilder.buildLayout();
        if (originalLayoutBuilder.key !== "$Root") return layout;
        if (!Array.isArray(layout)) return layout;

        if (layout.some(s => s?.key === "endcord_section")) return layout;
        if (getIsEndcordHidden()) return layout;

        const { buildEntry } = this;

        const endcordEntries: SettingsLayoutNode[] = [
            buildEntry({
                key: "endcord_main",
                title: "Endcord",
                panelTitle: "Endcord Settings",
                Component: EndcordTab,
                Icon: EndcordLogoIcon
            }),
            buildEntry({
                key: "endcord_plugins",
                title: "Plugins",
                Component: PluginsTab,
                Icon: PluginsTabIcon
            }),
            buildEntry({
                key: "endcord_themes",
                title: "Themes",
                Component: ThemesTab,
                Icon: ThemesTabIcon
            }),
            !IS_UPDATER_DISABLED && UpdaterTab && buildEntry({
                key: "endcord_updater",
                title: "Updater",
                panelTitle: "Endcord Updater",
                Component: UpdaterTab,
                Icon: UpdaterTabIcon
            }),

            buildEntry({
                key: "endcord_backup_restore",
                title: "Backup & Restore",
                Component: BackupAndRestoreTab,
                Icon: BackupTabIcon
            }),
            buildEntry({
                key: "endcord_diagnostics",
                title: "Diagnostics",
                Component: DiagnosticsTab,
                Icon: DiagnosticsTabIcon
            }),
            !IS_STANDALONE && PatchHelperTab && buildEntry({
                key: "endcord_patch_helper",
                title: "Patch Helper",
                Component: PatchHelperTab,
                Icon: PatchHelperTabIcon
            }),
            ...this.customEntries.map(buildEntry),
            // TODO: Remove deprecated customSections in a future update
            ...this.customSections.map((func, i) => {
                const { section, element, label } = func(FallbackSectionTypes);
                if (Object.values(FallbackSectionTypes).includes(section)) return null;

                return buildEntry({
                    key: `endcord_deprecated_custom_${section}`,
                    title: label,
                    Component: element,
                    Icon: PlaceholderIcon
                });
            })
        ].filter(isTruthy);

        const endcordSection: SettingsLayoutNode = {
            key: "endcord_section",
            type: LayoutTypes.SECTION,
            useTitle: () => t("Endcord Settings"),
            buildLayout: () => endcordEntries
        };

        const { settingsLocation } = settings.store;

        const places: Record<SettingsLocation, string> = {
            top: "user_section",
            aboveNitro: "billing_section",
            belowNitro: "billing_section",
            aboveActivity: "activity_section",
            belowActivity: "activity_section",
            bottom: "utility_section"
        };

        const key = places[settingsLocation] ?? places.top;
        let idx = layout.findIndex(s => typeof s?.key === "string" && s.key === key);

        if (idx === -1) {
            idx = 2;
        } else if (settingsLocation.startsWith("below")) {
            idx += 1;
        }

        layout.splice(idx, 0, endcordSection);

        return layout;
    },

    /** @deprecated Use customEntries */
    customSections: [] as ((SectionTypes: SectionTypes) => any)[],
    customEntries: [] as EntryOptions[],

    get electronVersion() {
        return EndcordNative.native.getVersions().electron || null;
    },

    get chromiumVersion() {
        try {
            return EndcordNative.native.getVersions().chrome
                // @ts-expect-error Typescript will add userAgentData IMMEDIATELY
                || navigator.userAgentData?.brands?.find(b => b.brand === "Chromium" || b.brand === "Google Chrome")?.version
                || null;
        } catch { // inb4 some stupid browser throws unsupported error for navigator.userAgentData, it's only in chromium
            return null;
        }
    },

    get additionalInfo() {
        if (IS_DEV) return " (Dev)";
        if (IS_WEB) return " (Web)";
        if (IS_ENDCORD_DESKTOP) return ` (Endcord Desktop v${EndcordDesktopNative.app.getVersion()})`;
        if (IS_STANDALONE) return " (Standalone)";
        return "";
    },

    getInfoRows() {
        const { electronVersion, chromiumVersion, additionalInfo } = this;

        const rows = [`Endcord ${gitHash}${additionalInfo}`];

        if (electronVersion) rows.push(`Electron ${electronVersion}`);
        if (chromiumVersion) rows.push(`Chromium ${chromiumVersion}`);

        return rows;
    },

    getInfoString() {
        if (!settings.store.includeEndcordInfoWhenCopying) return "";
        return `\n${this.getInfoRows().join("\n")}`;
    },

    makeInfoElements(Component: ComponentType<PropsWithChildren>, props: PropsWithChildren) {
        return this.getInfoRows().map((text, i) =>
            <Component key={i} {...props}>{text}</Component>
        );
    }
});
