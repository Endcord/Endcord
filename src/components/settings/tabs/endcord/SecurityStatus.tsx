/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./SecurityStatus.css?screen";

import { ShieldCheckIcon } from "@components/EndcordIcons";
import { ChevronSmallDownIcon } from "@components/Icons";
import type { UpdateTrust } from "@main/updater/common";
import { classNameFactory } from "@utils/css";
import { useI18n } from "@utils/i18n";
import { useAwaiter } from "@utils/react";
import { moment, useState } from "@webpack/common";

const cl = classNameFactory("ec-security-");

type Level = "good" | "waiting" | "bad";

interface Check {
    label: string;
    level: Level;
    detail: string;
}

function describe(trust: UpdateTrust | null, t: ReturnType<typeof useI18n>["t"]): Check[] {
    const checked = !!trust?.checkedAt;

    return [
        {
            label: t("Release signature"),
            ...!checked
                ? { level: "waiting", detail: t("Checked the next time Endcord can reach the update server.") }
                : trust.signed
                    ? { level: "good", detail: t("The current release is signed with Endcord's key. Checked {time}.", { time: moment(trust.checkedAt).fromNow() }) }
                    : { level: "bad", detail: t("The current release has no valid signature, so Endcord won't install it.") }
        },
        {
            label: t("Installed files"),
            ...trust?.installedFiles === "match"
                ? { level: "good", detail: t("Your files match the signed release exactly.") }
                : trust?.installedFiles === "changed"
                    ? { level: "bad", detail: t("Your files differ from the signed release. If you didn't change them, reinstall Endcord.") }
                    : { level: "waiting", detail: t("Compared while you are on the latest release.") }
        },
        {
            label: t("Update recovery"),
            ...trust?.rejected
                ? { level: "bad", detail: t("Release {hash} didn't start on this PC, so the version before it is running again. The next release will be tried again.", { hash: trust.rejected }) }
                : trust?.hasPrevious
                    ? { level: "good", detail: t("An update that fails to start three times is undone automatically.") }
                    : { level: "waiting", detail: t("Starts with your next update, which keeps the version before it.") }
        }
    ];
}

/** Only reports what the updater really checked, so a light can't be green without a reason */
export function SecurityStatus() {
    const { t } = useI18n();
    const [trust, , pending] = useAwaiter(EndcordNative.updater.getTrust);
    const [expanded, setExpanded] = useState(false);

    const checks = describe(trust, t);
    const problem = checks.some(check => check.level === "bad");
    const incomplete = pending || checks.some(check => check.level === "waiting");

    return (
        <section className={cl("root")}>
            <button className={cl("summary")} aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>
                <span className={cl("shield", { problem })}><ShieldCheckIcon width={22} height={22} /></span>
                <span className={cl("heading")}>
                    <span className={cl("title")}>{t("Security status")}</span>
                    <span className={cl("subtitle")}>
                        {problem ? t("Something needs your attention") : incomplete ? t("Some checks are still waiting") : t("All checks passed")}
                    </span>
                </span>
                <span className={cl("lights")}>
                    {checks.map(({ label, level }) => <span key={label} className={cl("light", level)} title={label} />)}
                </span>
                <ChevronSmallDownIcon className={cl("chevron", { expanded })} width={20} height={20} />
            </button>

            {expanded && (
                <div className={cl("details")}>
                    {checks.map(({ label, level, detail }) => (
                        <div key={label} className={cl("row")}>
                            <span className={cl("light", level)} />
                            <div>
                                <div className={cl("row-label")}>{label}</div>
                                <div className={cl("row-detail")}>{detail}</div>
                            </div>
                        </div>
                    ))}

                    <div className={cl("always")}>
                        <div className={cl("row-label")}>{t("Built in")}</div>
                        <ul>
                            <li>{t("Only Discord's own pages can reach Endcord's native features.")}</li>
                            <li>{t("Links from messages and other people can't make Endcord reach this PC or your local network.")}</li>
                            <li>{t("API keys and passwords in plugin settings stay out of backups and cloud sync.")}</li>
                        </ul>
                    </div>
                </div>
            )}
        </section>
    );
}
