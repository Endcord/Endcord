/*
 * Endcord, a Discord client mod
 * Copyright (c) 2025 nin0
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BaseText } from "@components/BaseText";
import { Card } from "@components/Card";
import { t } from "@utils/i18n";
import { Button, useEffect, useState } from "@webpack/common";

const HeadphonesIcon = (props: any) => (
    <svg {...props} width={props.width ?? 20} height={props.height ?? 20} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 3a9 9 0 0 0-9 9v7c0 1.1.9 2 2 2h3a1 1 0 0 0 1-1v-6a1 1 0 0 0-1-1H5v-1a7 7 0 0 1 14 0v1h-3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h3a2 2 0 0 0 2-2v-7a9 9 0 0 0-9-9z" />
    </svg>
);

import pl, { Native, settings, SongLinkResult } from ".";
import { Providers } from "./Providers";

interface SongLinkerProps {
    url: string;
    onResolved?: (url: string, result: SongLinkResult) => void;
}

const FAILURE_TTL = 5 * 60_000;
const pending = new Map<string, Promise<SongLinkResult>>();
const failedAt = new Map<string, number>();

function getTrackData(url: string): Promise<SongLinkResult> {
    let p = pending.get(url);
    if (!p) {
        p = Native.getTrackData(url).then(sd => {
            pl.addToCache(url, sd);
            return sd;
        }, e => {
            failedAt.set(url, Date.now());
            throw e;
        }).finally(() => pending.delete(url));
        pending.set(url, p);
    }
    return p;
}

export default function SongLinker({ url, onResolved }: SongLinkerProps) {
    const [songData, setSongData] = useState<SongLinkResult>();
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setFailed(false);
        async function doStuff() {
            let sd: SongLinkResult;
            if (pl.cache[url]) {
                sd = pl.cache[url];
            } else {
                const at = failedAt.get(url);
                if (at !== undefined && Date.now() - at < FAILURE_TTL) {
                    setFailed(true);
                    return;
                }
                try {
                    sd = await getTrackData(url);
                } catch {
                    if (!cancelled) setFailed(true);
                    return;
                }
            }
            if (cancelled) return;
            setSongData(sd);
            onResolved?.(url, sd);
        }
        doStuff();
        return () => { cancelled = true; };
    }, [url]);

    if (failed && !songData) return <BaseText>{t("Couldn't load this right now :(")}</BaseText>;

    return <BaseText>
        {
            songData ? <Card style={{
                padding: "10px 15px"
            }}>
                <div>
                    <BaseText style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 600, fontSize: "1.05rem" }}>
                        <HeadphonesIcon /> {songData.info?.title} - {songData.info?.artist}
                    </BaseText>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px", marginTop: "10px" }}>
                        {
                            Object.keys(songData.links).map(service => settings.store.servicesSettings[service].enabled && <Button key={`${service}-${url}`} style={{
                                width: "20px !important"
                                // @ts-ignore
                            }} variant="secondary" onClick={() => {
                                // FIXME: fix type error
                                // @ts-expect-error ???
                                EndcordNative.native.openExternal(settings.store.servicesSettings[service].openInNative && Providers[service].native ? songData.links[service].nativeUri : songData.links[service].url);
                            }}>
                                <img
                                    src={Providers[service].logo}
                                    alt={`${Providers[service]} logo`}
                                    style={{ width: 16, height: 16, objectFit: "contain", display: "block" }}
                                />
                            </Button>)
                        }
                    </div>
                </div>
            </Card> : <BaseText>{t("Loading song link...")}</BaseText>
        }
    </BaseText >;
}
