/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addStarterPacks, ApplyResult, deleteProfile, isProfileActive, previewPluginSet, saveCurrentAsProfile, switchToProfile, updateProfile } from "@api/PluginProfiles";
import { getChosenPlugins } from "@api/SafeMode";
import { PluginProfile, useSettings } from "@api/Settings";
import { EndcordModal } from "@components/EndcordModal";
import { StarterPackPicker, useStarterPacks } from "@components/settings/StarterPacks";
import { RenderModalProps } from "@endcord/discord-types";
import { t, useI18n } from "@utils/i18n";
import { relaunch } from "@utils/native";
import { openModal, showToast, TextInput, Toasts, useState } from "@webpack/common";

import { cl } from ".";

function NameProfileModal({ profile, onClose, transitionState }: RenderModalProps & { profile?: PluginProfile; }) {
    const { t } = useI18n();
    const [name, setName] = useState(profile?.name ?? "");
    const valid = name.trim().length > 0;

    const save = () => {
        if (!valid) return;
        if (profile) updateProfile(profile.id, { name: name.trim().slice(0, 40) });
        else saveCurrentAsProfile(name);
        onClose();
    };

    return (
        <EndcordModal
            transitionState={transitionState}
            onClose={onClose}
            size="sm"
            title={profile ? t("Rename profile") : t("Save as a profile")}
            subtitle={profile ? undefined : t("Keeps the {count} plugins on right now under one name, to come back to in one click.", { count: getChosenPlugins().length })}
            actions={[
                { text: t("Cancel"), variant: "secondary", onClick: onClose },
                { text: t("Save"), variant: "primary", disabled: !valid, onClick: save }
            ]}
        >
            <form onSubmit={e => { e.preventDefault(); save(); }}>
                <TextInput value={name} onChange={setName} placeholder={t("Gaming, Work, Streaming...")} maxLength={40} autoFocus />
            </form>
        </EndcordModal>
    );
}

function ChangeList({ title, names }: { title: string; names: string[]; }) {
    if (!names.length) return null;

    return (
        <div className={cl("change")}>
            <h3 className={cl("change-title")}>{title}</h3>
            <p className={cl("change-names")}>{names.sort().join(", ")}</p>
        </div>
    );
}

function reportResult(result: ApplyResult, onRestartNeeded: () => void, done: string) {
    if (result.restartNeeded) onRestartNeeded();
    else showToast(done, Toasts.Type.SUCCESS);
}

function SwitchProfileModal({ profile, onRestartNeeded, onClose, transitionState }: RenderModalProps & { profile: PluginProfile; onRestartNeeded(): void; }) {
    const { t } = useI18n();
    const { on, off } = previewPluginSet(profile.plugins);
    const [busy, setBusy] = useState(false);

    return (
        <EndcordModal
            transitionState={transitionState}
            onClose={onClose}
            size="sm"
            title={t("Switch to {name}?", { name: profile.name })}
            subtitle={t("Your current settings are saved as a snapshot first, so you can go back from Backup & Restore.")}
            actions={[
                { text: t("Cancel"), variant: "secondary", onClick: onClose },
                {
                    text: t("Switch"),
                    variant: "primary",
                    disabled: busy,
                    async onClick() {
                        setBusy(true);
                        const result = await switchToProfile(profile);
                        onClose();
                        reportResult(result, onRestartNeeded, t("Switched to {name}", { name: profile.name }));
                    }
                }
            ]}
        >
            <ChangeList title={t("Turns on ({count})", { count: on.length })} names={on} />
            <ChangeList title={t("Turns off ({count})", { count: off.length })} names={off} />
        </EndcordModal>
    );
}

function EditProfileModal({ profile, onClose, transitionState }: RenderModalProps & { profile: PluginProfile; }) {
    const { t } = useI18n();
    const { on, off } = previewPluginSet(profile.plugins);
    const differs = on.length + off.length > 0;

    return (
        <EndcordModal
            transitionState={transitionState}
            onClose={onClose}
            size="sm"
            title={profile.name}
            subtitle={t("{count} plugins", { count: profile.plugins.length })}
            actions={[
                {
                    text: t("Delete"),
                    variant: "critical-primary",
                    onClick() {
                        deleteProfile(profile.id);
                        onClose();
                    }
                },
                {
                    text: t("Rename"),
                    variant: "secondary",
                    onClick() {
                        onClose();
                        openModal(props => <NameProfileModal {...props} profile={profile} />);
                    }
                },
                {
                    text: t("Save the plugins on now"),
                    variant: "primary",
                    disabled: !differs,
                    onClick() {
                        updateProfile(profile.id, { plugins: getChosenPlugins().sort() });
                        showToast(t("{name} updated", { name: profile.name }), Toasts.Type.SUCCESS);
                        onClose();
                    }
                }
            ]}
        >
            {differs
                ? <p className={cl("change-names")}>{t("Switching to it would turn on {on} plugins and turn off {off}.", { on: on.length, off: off.length })}</p>
                : <p className={cl("change-names")}>{t("This is what's on right now.")}</p>}
        </EndcordModal>
    );
}

function StarterPacksModal({ onRestartNeeded, onClose, transitionState }: RenderModalProps & { onRestartNeeded(): void; }) {
    const { t } = useI18n();
    const packs = useStarterPacks();
    const [selected, setSelected] = useState(() => new Set<string>());
    const chosen = packs.filter(pack => selected.has(pack.id));
    const adding = previewPluginSet([...getChosenPlugins(), ...chosen.flatMap(pack => pack.plugins)]).on;

    return (
        <EndcordModal
            transitionState={transitionState}
            onClose={onClose}
            size="lg"
            title={t("Starter packs")}
            subtitle={t("Plugins that go well together. A pack only turns plugins on, and nothing you have on changes.")}
            actions={[
                { text: t("Cancel"), variant: "secondary", onClick: onClose },
                {
                    text: adding.length ? t("Turn on {count} plugins", { count: adding.length }) : t("Turn on"),
                    variant: "primary",
                    disabled: !adding.length,
                    async onClick() {
                        const result = await addStarterPacks(chosen);
                        onClose();
                        reportResult(result, onRestartNeeded, t("{count} plugins turned on", { count: result.turnedOn }));
                    }
                }
            ]}
        >
            <StarterPackPicker
                packs={packs}
                selected={selected}
                onToggle={id => setSelected(prev => {
                    const next = new Set(prev);
                    next.has(id) ? next.delete(id) : next.add(id);
                    return next;
                })}
            />
        </EndcordModal>
    );
}

/** For changes made away from the Plugins tab, which has its own restart card */
export function promptRestart() {
    openModal(props => (
        <EndcordModal
            {...props}
            size="sm"
            title={t("Restart to finish")}
            subtitle={t("Some of these plugins change Discord's code, which only happens as Discord starts.")}
            actions={[
                { text: t("Later"), variant: "secondary", onClick: props.onClose },
                { text: t("Restart now"), variant: "primary", onClick: relaunch }
            ]}
        />
    ));
}

export function openSwitchProfileModal(profile: PluginProfile, onRestartNeeded: () => void) {
    openModal(props => <SwitchProfileModal {...props} profile={profile} onRestartNeeded={onRestartNeeded} />);
}

export function openStarterPacksModal(onRestartNeeded: () => void) {
    openModal(props => <StarterPacksModal {...props} onRestartNeeded={onRestartNeeded} />);
}

/** The profiles above the plugin list, with ways to make one or add a starter pack */
export function ProfilesBar({ onRestartNeeded }: { onRestartNeeded(): void; }) {
    const { t } = useI18n();
    const { pluginProfiles } = useSettings(["pluginProfiles", "plugins.*"]);

    return (
        <section className={cl("profiles")}>
            <div className={cl("profiles-head")}>
                <span className={cl("profiles-label")}>{t("Profiles")}</span>
                <button className={cl("text-button")} onClick={() => openModal(props => <NameProfileModal {...props} />)}>
                    {t("Save current as profile")}
                </button>
                <button className={cl("text-button")} onClick={() => openStarterPacksModal(onRestartNeeded)}>
                    {t("Starter packs")}
                </button>
            </div>

            {pluginProfiles.length
                ? (
                    <div className={cl("profile-list")}>
                        {pluginProfiles.map(profile => {
                            const active = isProfileActive(profile);

                            return (
                                <div key={profile.id} className={cl("profile", { "profile-active": active })}>
                                    <button
                                        className={cl("profile-switch")}
                                        aria-pressed={active}
                                        onClick={() => active
                                            ? showToast(t("{name} is already on", { name: profile.name }))
                                            : openSwitchProfileModal(profile, onRestartNeeded)}
                                    >
                                        <span className={cl("profile-name")}>{profile.name}</span>
                                        <span className={cl("profile-count")}>{profile.plugins.length}</span>
                                    </button>
                                    <button
                                        className={cl("profile-more")}
                                        aria-label={t("Edit {name}", { name: profile.name })}
                                        onClick={() => openModal(props => <EditProfileModal {...props} profile={profile} />)}
                                    >
                                        ⋯
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )
                : <p className={cl("profiles-hint")}>{t("Save the plugins you have on now as a profile, like Gaming or Work, then switch between them in one click.")}</p>
            }
        </section>
    );
}

