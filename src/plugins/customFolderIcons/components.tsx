/*
 * Endcord, a Discord client mod
 * Copyright (c) 2024 sadan
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t } from "@utils/i18n";
import { Button, closeModal, Menu, Modal,openModalLazy, Slider, TextInput, useState } from "@webpack/common";

import { folderIconsData, settings } from "./settings";
import { folderProp, int2rgba, setFolderData } from "./util";

export function ImageModal(folderProps: folderProp) {
    const [data, setData] = useState(((settings.store.folderIcons ?? {}) as folderIconsData)[folderProps.folderId]?.url ?? "");
    const [size, setSize] = useState(100);
    return (
        <>
            <TextInput
                // this looks like a horrorshow
                defaultValue={data}
                onChange={(val, _n) => {
                    setData(val);
                }}
                placeholder="https://example.com/image.png"
            >
            </TextInput>
            <RenderPreview folderProps={folderProps} url={data} size={size} />
            {data && <>
                <div style={{
                    color: "#FFF"
                }}>{t("Change the size of the folder icon")}</div>
                <Slider
                    initialValue={100}
                    onValueChange={(v: number) => {
                        setSize(v);
                    }}
                    maxValue={200}
                    minValue={25}
                    // [25, 200]
                    markers={Array.apply(0, Array(176)).map((_, i) => i + 25)}
                    stickToMarkers={true}
                    keyboardStep={1}
                    renderMarker={() => null} />
            </>}
            <Button onClick={() => {
                setFolderData(folderProps, {
                    url: data,
                    size: size
                });
                closeModal("custom-folder-icon");
            }}
            >
                {t("Save")}</Button>
            <hr />
            <Button onClick={() => {
                // INFO: unset button
                const folderSettings = settings.store.folderIcons as folderIconsData;
                if (folderSettings[folderProps.folderId]) {
                    folderSettings[folderProps.folderId] = null;
                }
                closeModal("custom-folder-icon");
            }}>
                {t("Unset")}</Button>
            <hr />
        </>
    );
}
export function RenderPreview({ folderProps, url, size }: { folderProps: folderProp; url: string; size: number; }) {
    if (!url) return null;
    return (
        <div className="test1234" style={{
            width: "20vh",
            height: "20vh",
            overflow: "hidden",
            // 16/48
            borderRadius: "33%",
            backgroundColor: int2rgba(folderProps.folderColor, 0.4),
            display: "flex",
            justifyContent: "center",
            alignItems: "center"
        }}>
            <img alt="" src={url} width={`${size}%`} height={`${size}%`} />
        </div>
    );
}

export function makeContextItem(a: folderProp) {
    return (
        <Menu.MenuItem
            id="custom-folder-icons"
            key="custom-folder-icons"
            label={t("Change Icon")}
            action={() => {
                openModalLazy(async () => {
                    return props => (
                        <Modal
                            {...props}
                            size="sm"
                            title={t("Set a New Icon.")}
                        >
                            <ImageModal folderId={a.folderId} folderColor={a.folderColor} />
                            <div style={{
                                color: "white",
                                margin: "2.5%",
                                marginTop: "1%"
                            }}>
                                {t("You might have to hover the folder after setting in order for it to refresh.")}</div>
                        </Modal>
                    );
                },
                    {
                        modalKey: "custom-folder-icon"
                    });
            }} />
    );
}
