/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { FormSwitch } from "@components/FormSwitch";
import { Heading } from "@components/Heading";
import { encrypt } from "@plugins/invisibleChat.desktop/index";
import { insertTextIntoChatInputBox } from "@utils/discord";
import { t } from "@utils/i18n";
import { RenderModalProps } from "@vencord/discord-types";
import { Modal, openModal, React, TextInput } from "@webpack/common";

function EncModal(props: RenderModalProps) {
    const [secret, setSecret] = React.useState("");
    const [cover, setCover] = React.useState("");
    const [password, setPassword] = React.useState("password");
    const [noCover, setNoCover] = React.useState(false);

    const isValid = secret && (noCover || (cover && cover.trim().split(" ").length > 1));

    const onSend = () => {
        if (!isValid) return;
        const encrypted = encrypt(secret, password, noCover ? "d d" : cover);
        const toSend = noCover ? encrypted.replaceAll("d", "") : encrypted;
        if (!toSend) return;

        insertTextIntoChatInputBox(toSend);

        props.onClose();
    };

    return (
        <Modal
            {...props}
            size="sm"
            title={t("Encrypt Message")}
            actions={[
                {
                    text: "Send",
                    variant: "primary",
                    disabled: !isValid,
                    onClick: onSend
                },
                {
                    text: "Cancel",
                    variant: "secondary",
                    onClick: props.onClose
                }
            ]}
        >
            <Heading style={{ marginTop: "10px" }}>{t("Secret")}</Heading>
            <TextInput
                onChange={(e: string) => {
                    setSecret(e);
                }}
            />
            <Heading style={{ marginTop: "10px" }}>{t("Cover (2 or more Words!!)")}</Heading>
            <TextInput
                disabled={noCover}
                onChange={(e: string) => {
                    setCover(e);
                }}
            />
            <Heading style={{ marginTop: "10px" }}>{t("Password")}</Heading>
            <TextInput
                style={{ marginBottom: "20px" }}
                defaultValue={"password"}
                onChange={(e: string) => {
                    setPassword(e);
                }}
            />
            <FormSwitch
                title={t("Don't use a Cover")}
                value={noCover}
                onChange={(e: boolean) => {
                    setNoCover(e);
                }}
            />
        </Modal>
    );
}

export function buildEncModal(): any {
    openModal(props => <EncModal {...props} />);
}
