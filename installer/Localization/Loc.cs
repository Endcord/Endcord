using System;
using System.Collections.Generic;
using System.Globalization;

namespace EndcordInstaller.Localization
{
    public sealed class LanguageOption
    {
        public string Code { get; private set; }
        public string NativeName { get; private set; }
        public string Subtitle { get; private set; }
        public string ShortBadge { get; private set; }

        public LanguageOption(string code, string nativeName, string subtitle, string shortBadge)
        {
            Code = code;
            NativeName = nativeName;
            Subtitle = subtitle;
            ShortBadge = shortBadge;
        }
    }

    public static class Loc
    {
        public static readonly LanguageOption[] SupportedLanguages =
        {
            new LanguageOption("en", "English", "United States / International", "EN"),
            new LanguageOption("tr", "Türkçe", "Türkiye", "TR"),
            new LanguageOption("ru", "Русский", "Россия / СНГ", "RU"),
            new LanguageOption("es", "Español", "España / Latinoamérica", "ES"),
            new LanguageOption("fr", "Français", "France / International", "FR")
        };

        static readonly Dictionary<string, Dictionary<string, string>> Tables = BuildTables();
        static string _current = "en";

        public static event Action LanguageChanged;

        public static string CurrentLanguage
        {
            get { return _current; }
        }

        public static LanguageOption CurrentOption
        {
            get
            {
                foreach (var l in SupportedLanguages)
                    if (l.Code == _current) return l;
                return SupportedLanguages[0];
            }
        }

        public static void SetLanguage(string code)
        {
            string norm = NormalizeCode(code);
            if (!Tables.ContainsKey(norm)) norm = "en";
            if (_current == norm) return;
            _current = norm;
            var h = LanguageChanged;
            if (h != null) h();
        }

        public static void Initialize(string savedLanguage)
        {
            if (!string.IsNullOrEmpty(savedLanguage) && Tables.ContainsKey(NormalizeCode(savedLanguage)))
            {
                _current = NormalizeCode(savedLanguage);
                return;
            }
            _current = "en";
        }

        static string NormalizeCode(string code)
        {
            if (string.IsNullOrEmpty(code)) return "en";
            code = code.Trim().ToLowerInvariant();
            if (code.Length >= 2) code = code.Substring(0, 2);
            return code;
        }

        public static string T(string key)
        {
            if (string.IsNullOrEmpty(key)) return "";
            Dictionary<string, string> langMap;
            string val;
            if (Tables.TryGetValue(_current, out langMap) && langMap.TryGetValue(key, out val) && !string.IsNullOrEmpty(val))
                return val;
            if (Tables["en"].TryGetValue(key, out val))
                return val;
            return key;
        }

        public static string F(string key, params object[] args)
        {
            string fmt = T(key);
            if (args == null || args.Length == 0) return fmt;
            try
            {
                return string.Format(CultureInfo.InvariantCulture, fmt, args);
            }
            catch
            {
                return fmt;
            }
        }

        public static List<string> FindMissingTranslations()
        {
            var missing = new List<string>();
            var enKeys = Tables["en"].Keys;
            foreach (var lang in SupportedLanguages)
            {
                var table = Tables[lang.Code];
                foreach (var k in enKeys)
                {
                    string v;
                    if (!table.TryGetValue(k, out v) || string.IsNullOrEmpty(v))
                        missing.Add(lang.Code + ":" + k);
                }
            }
            return missing;
        }

        delegate void AddEntryDelegate(string key, string vEn, string vTr, string vRu, string vEs, string vFr);

        static Dictionary<string, Dictionary<string, string>> BuildTables()
        {
            var root = new Dictionary<string, Dictionary<string, string>>(StringComparer.OrdinalIgnoreCase);

            var en = new Dictionary<string, string>(StringComparer.Ordinal);
            var tr = new Dictionary<string, string>(StringComparer.Ordinal);
            var ru = new Dictionary<string, string>(StringComparer.Ordinal);
            var es = new Dictionary<string, string>(StringComparer.Ordinal);
            var fr = new Dictionary<string, string>(StringComparer.Ordinal);

            AddEntryDelegate Add = (key, vEn, vTr, vRu, vEs, vFr) =>
            {
                en[key] = vEn;
                tr[key] = vTr;
                ru[key] = vRu;
                es[key] = vEs;
                fr[key] = vFr;
            };

            // ── Intro & Language Selection Screen ────────────────────────────
            Add("app.title",
                "Endcord Installer",
                "Endcord Kurulumu",
                "Установщик Endcord",
                "Instalador de Endcord",
                "Installateur Endcord");

            Add("app.subtitle",
                "A lightweight, friendly Discord mod",
                "Hafif ve sevimli bir Discord modu",
                "Лёгкий и дружелюбный мод для Discord",
                "Un mod de Discord ligero y amigable",
                "Un mod Discord léger et sympa");

            Add("lang.welcome",
                "Hey, welcome!",
                "Selam, hoş geldin!",
                "Привет, добро пожаловать!",
                "¡Hola, bienvenido!",
                "Coucou, bienvenue !");

            Add("lang.choosePrompt",
                "Pick a language to get started",
                "Başlamak için bir dil seç",
                "Выберите язык, чтобы начать",
                "Elige un idioma para empezar",
                "Choisissez une langue pour commencer");

            Add("lang.btn.continue",
                "Let's go",
                "Hadi başlayalım",
                "Поехали",
                "¡Vamos!",
                "C'est parti");

            // ── Migration Screen (Matching Reference Card) ───────────────────
            Add("mig.welcomeTitle",
                "Oh, a familiar face!",
                "Aa, tanıdık bir yüz!",
                "О, знакомое лицо!",
                "¡Oh, una cara conocida!",
                "Oh, une tête connue !");

            Add("mig.switchedShort",
                "Looks like you’ve switched from {0}.",
                "Görünüşe göre {0} istemcisinden geçtiniz.",
                "Похоже, вы перешли с {0}.",
                "Parece que te has cambiado desde {0}.",
                "Il semble que vous veniez de {0}.");

            Add("mig.banner.prompt",
                "You came over from {0}. Want Endcord to bring your settings along?",
                "{0} kullanıyormuşsun. Endcord ayarlarını da beraberinde getirsin mi?",
                "Вы пришли с {0}. Перенести ваши настройки в Endcord?",
                "Vienes de {0}. ¿Quieres que Endcord traiga tus ajustes contigo?",
                "Vous venez de {0}. Endcord peut emporter vos paramètres, ça vous dit ?");

            Add("mig.card.title",
                "Pack your settings?",
                "Ayarlar bavula girsin mi?",
                "Собрать настройки в дорогу?",
                "¿Empacamos tus ajustes?",
                "On fait vos valises ?");

            Add("mig.card.body",
                "Your previous settings were found. You can import compatible preferences and plugin configurations into Endcord.",
                "Önceki ayarların bulundu. Uyumlu tercihlerini, temalarını ve eklenti yapılandırmalarını Endcord'a aktarabilirsin.",
                "Найдены ваши предыдущие настройки. Вы можете импортировать совместимые параметры и конфигурации плагинов в Endcord.",
                "Se encontraron tus ajustes anteriores. Puedes importar las preferencias compatibles y configuraciones de plugins en Endcord.",
                "Vos anciens paramètres ont été trouvés. Vous pouvez importer vos préférences et configurations de plugins compatibles dans Endcord.");

            Add("mig.card.stats",
                "{0} plugins and {1} themes can come along. A backup is made first, just in case.",
                "{0} eklenti ve {1} tema seninle gelebilir. Her ihtimale karşı önce yedek alınır.",
                "С вами переедут плагины ({0}) и темы ({1}). Сначала сделаем бэкап, на всякий случай.",
                "Pueden venir {0} plugins y {1} temas. Antes hacemos una copia, por si acaso.",
                "{0} plugins et {1} thèmes peuvent suivre. Une sauvegarde est faite avant, au cas où.");

            Add("mig.card.inspectLink",
                "Peek inside ({0} coming, {1} staying behind)",
                "İçine göz at ({0} geliyor, {1} kalıyor)",
                "Заглянуть внутрь ({0} переедут, {1} останутся)",
                "Echar un vistazo ({0} vienen, {1} se quedan)",
                "Jeter un œil ({0} suivent, {1} restent)");

            Add("mig.card.hideInspect",
                "Close the suitcase",
                "Bavulu kapat",
                "Закрыть чемодан",
                "Cerrar la maleta",
                "Fermer la valise");

            Add("mig.btn.importSettings",
                "Bring them along",
                "Getir gelsin",
                "Перенести",
                "Tráelos",
                "On les emmène");

            Add("mig.btn.startFresh",
                "Start fresh",
                "Sıfırdan başla",
                "Начать с нуля",
                "Empezar de cero",
                "Repartir à zéro");

            // ── Main Client Selection & Mode Screen ──────────────────────────
            Add("main.title",
                "Where should Endcord live?",
                "Endcord nereye yerleşsin?",
                "Где поселится Endcord?",
                "¿Dónde vivirá Endcord?",
                "Où installer Endcord ?");

            Add("main.subtitle",
                "Pick the Discords you want Endcord on.",
                "Endcord'un geleceği Discord'ları seç.",
                "Выберите, в какие Discord установить Endcord.",
                "Elige en qué Discord quieres Endcord.",
                "Choisissez les Discord qui auront Endcord.");

            Add("tab.install",
                "Install",
                "Kurulum",
                "Установка",
                "Instalar",
                "Installer");

            Add("tab.repair",
                "Repair",
                "Onar",
                "Починка",
                "Reparar",
                "Réparer");

            Add("tab.uninstall",
                "Uninstall",
                "Kaldır",
                "Удалить",
                "Desinstalar",
                "Désinstaller");

            Add("tab.backups",
                "Backups",
                "Yedekler",
                "Бэкапы",
                "Copias",
                "Sauvegardes");

            Add("btn.addCustomPath",
                "+ Custom Path",
                "+ Özel Konum",
                "+ Свой путь",
                "+ Otra ruta",
                "+ Autre chemin");

            Add("btn.refresh",
                "Refresh",
                "Yenile",
                "Обновить",
                "Actualizar",
                "Actualiser");

            Add("chk.relaunch",
                "Open Discord again when done",
                "Bitince Discord'u tekrar aç",
                "Открыть Discord после завершения",
                "Abrir Discord al terminar",
                "Rouvrir Discord à la fin");

            Add("action.install",
                "Install Endcord",
                "Endcord'u Kur",
                "Установить Endcord",
                "Instalar Endcord",
                "Installer Endcord");

            Add("action.update",
                "Update Endcord",
                "Endcord'u Güncelle",
                "Обновить Endcord",
                "Actualizar Endcord",
                "Mettre à jour Endcord");

            Add("action.repair",
                "Repair Endcord",
                "Kurulumu Onar",
                "Восстановить Endcord",
                "Reparar Endcord",
                "Réparer Endcord");

            Add("action.uninstall",
                "Uninstall Endcord",
                "Endcord'u Kaldır",
                "Удалить Endcord",
                "Desinstalar Endcord",
                "Désinstaller Endcord");

            Add("action.cancel",
                "Cancel",
                "İptal Et",
                "Отмена",
                "Cancelar",
                "Annuler");

            // ── Badges & Card States ─────────────────────────────────────────
            Add("card.running", "Running", "Çalışıyor", "Запущен", "Abierto", "En cours");
            Add("card.closed", "Closed", "Kapalı", "Закрыт", "Cerrado", "Fermé");
            Add("card.status.endcord",
                "Has Endcord",
                "Endcord'lu",
                "С Endcord",
                "Con Endcord",
                "Avec Endcord");
            Add("card.status.vanilla",
                "Ready",
                "Hazır",
                "Готов",
                "Listo",
                "Prêt");
            Add("card.status.conflict", "{0}", "{0}", "{0}", "{0}", "{0}");
            Add("card.status.damaged",
                "Needs a fix",
                "Onarım lazım",
                "Нужен ремонт",
                "Necesita arreglo",
                "À réparer");

            Add("empty.noDiscord.title",
                "Hmm, no Discord here",
                "Hmm, burada Discord yok",
                "Хм, Discord не найден",
                "Mmm, no hay Discord aquí",
                "Hum, pas de Discord ici");

            Add("empty.noDiscord.desc",
                "If it lives somewhere special, show the panda with '+ Custom Path' below.",
                "Başka bir yerdeyse aşağıdaki '+ Özel Konum' ile pandaya göster.",
                "Если он в особом месте, покажите его панде через «+ Свой путь».",
                "Si está en otro sitio, muéstraselo al panda con '+ Otra ruta'.",
                "S'il est ailleurs, montrez-le au panda avec « + Autre chemin ».");

            // ── Progress & Completion Screens ────────────────────────────────
            Add("prog.installingTitle",
                "Installing Endcord",
                "Endcord Kuruluyor",
                "Установка Endcord",
                "Instalando Endcord",
                "Installation d'Endcord");

            Add("prog.updatingTitle",
                "Updating Endcord",
                "Endcord Güncelleniyor",
                "Обновление Endcord",
                "Actualizando Endcord",
                "Mise à jour d'Endcord");

            Add("prog.repairingTitle",
                "Repairing Endcord",
                "Endcord Onarılıyor",
                "Восстановление Endcord",
                "Reparando Endcord",
                "Réparation d'Endcord");

            Add("prog.uninstallingTitle",
                "Restoring Vanilla Discord",
                "Orijinal Discord'a Dönülüyor",
                "Удаление Endcord",
                "Restaurando Discord",
                "Désinstallation d'Endcord");

            Add("status.preparingInstall",
                "Fluffing the pillows...",
                "Yastıklar kabartılıyor...",
                "Взбиваем подушки...",
                "Mullendo las almohadas...",
                "On tapote les coussins...");
            Add("status.preparingUpdate",
                "Fetching fresh bamboo...",
                "Taze bambu getiriliyor...",
                "Несём свежий бамбук...",
                "Trayendo bambú fresco...",
                "On apporte du bambou frais...");
            Add("status.preparingRepair",
                "Grabbing the toolbox...",
                "Alet çantası alınıyor...",
                "Достаём инструменты...",
                "Buscando la caja de herramientas...",
                "On sort la boîte à outils...");
            Add("status.closingClient", "Closing {0}...", "{0} kapatılıyor...", "Закрытие {0}...", "Cerrando {0}...", "Fermeture de {0}...");
            Add("status.extractingAsset", "Deploying {0}...", "{0} aktarılıyor...", "Распаковка {0}...", "Desplegando {0}...", "Déploiement de {0}...");
            Add("status.cleaningForeignMod", "Unhooking {0} from {1}...", "{1} içinden {0} kaldırılıyor...", "Отключение {0} из {1}...", "Desactivando {0} de {1}...", "Décrochage de {0} dans {1}...");
            Add("status.patchingClient", "Patching {0} ({1})...", "{0} ({1}) yamalanıyor...", "Патчинг {0} ({1})...", "Parcheando {0} ({1})...", "Patch de {0} ({1})...");
            Add("status.restoringClient", "Restoring {0} ({1})...", "{0} ({1}) geri yükleniyor...", "Восстановление {0} ({1})...", "Restaurando {0} ({1})...", "Restauration de {0} ({1})...");
            Add("status.verifyingClient", "Verifying {0}...", "{0} doğrulanıyor...", "Проверка {0}...", "Verificando {0}...", "Vérification de {0}...");
            Add("status.relaunchingClient", "Launching {0}...", "{0} başlatılıyor...", "Запуск {0}...", "Iniciando {0}...", "Lancement de {0}...");
            Add("status.rollingBack",
                "Putting everything back the way it was...",
                "Her şey eski haline getiriliyor...",
                "Возвращаем всё как было...",
                "Dejando todo como estaba...",
                "On remet tout comme avant...");
            Add("status.waitingLockedFile", "Waiting for locked file: {0}", "Kilitli dosya bekleniyor: {0}", "Ожидание файла: {0}", "Esperando archivo: {0}", "Attente du fichier : {0}");

            Add("status.installComplete",
                "All set! Endcord is here",
                "Hepsi tamam! Endcord burada",
                "Готово! Endcord на месте",
                "¡Listo! Endcord ya está aquí",
                "Et voilà ! Endcord est là");
            Add("status.updateComplete",
                "Fresh and updated!",
                "Tertemiz güncellendi!",
                "Свежо и обновлено!",
                "¡Recién actualizado!",
                "Tout frais, à jour !");
            Add("status.repairComplete",
                "Good as new!",
                "Yepyeni gibi!",
                "Как новенький!",
                "¡Como nuevo!",
                "Comme neuf !");
            Add("status.uninstallComplete",
                "Back to plain Discord",
                "Sade Discord'a dönüldü",
                "Снова обычный Discord",
                "De vuelta a Discord normal",
                "Retour au Discord d'origine");

            Add("done.banner.installed",
                "Endcord is on {0} Discord install(s). Open Discord and say hi!",
                "Endcord {0} Discord kurulumunda hazır. Discord'u aç ve merhaba de!",
                "Endcord установлен ({0}). Откройте Discord и поздоровайтесь!",
                "Endcord está en {0} Discord. ¡Abre Discord y saluda!",
                "Endcord est sur {0} Discord. Ouvrez Discord et dites bonjour !");

            Add("done.banner.migrated",
                "Brought over {0} plugins, {1} preferences and {2} themes from {3}.",
                "{3} içinden {0} eklenti, {1} tercih ve {2} tema taşındı.",
                "Перенесено из {3}: плагинов {0}, настроек {1}, тем {2}.",
                "Traídos desde {3}: {0} plugins, {1} ajustes y {2} temas.",
                "Depuis {3} : {0} plugins, {1} préférences et {2} thèmes emménagés.");

            Add("done.cleanupOffer",
                "Tidy up the leftover {0} files (your settings stay safe)",
                "Kalan {0} dosyalarını topla (ayarların güvende kalır)",
                "Убрать остатки {0} (настройки сохранятся)",
                "Recoger los restos de {0} (tus ajustes están a salvo)",
                "Ranger les restes de {0} (vos paramètres restent)");

            Add("done.btn.finish",
                "Back to start",
                "Başa dön",
                "В начало",
                "Volver al inicio",
                "Retour au début");

            Add("done.btn.closeApp",
                "Done, see you!",
                "Tamam, görüşürüz!",
                "Готово, пока!",
                "¡Listo, nos vemos!",
                "Fini, à plus !");

            // ── Conflict & Error Messages ────────────────────────────────────
            Add("conflict.title",
                "Swap out {0}?",
                "{0} yerine geçelim mi?",
                "Заменить {0}?",
                "¿Cambiamos {0}?",
                "On remplace {0} ?");

            Add("conflict.message",
                "{0} is living in {1} right now. Endcord will gently move it aside and take its spot. Your {0} settings stay untouched.",
                "{0} şu an {1} içinde yaşıyor. Endcord onu nazikçe kenara alıp yerine geçecek. {0} ayarlarına hiç dokunulmaz.",
                "{0} сейчас живёт в {1}. Endcord аккуратно подвинет его и займёт место. Настройки {0} останутся как есть.",
                "{0} vive ahora en {1}. Endcord lo apartará con cuidado y ocupará su lugar. Tus ajustes de {0} no se tocan.",
                "{0} habite dans {1} en ce moment. Endcord va le pousser doucement et prendre sa place. Vos paramètres {0} restent intacts.");

            Add("conflict.btn.confirm",
                "Swap and install",
                "Değiştir ve kur",
                "Заменить и установить",
                "Cambiar e instalar",
                "Remplacer et installer");

            Add("conflict.btn.cancel",
                "Not now",
                "Şimdi değil",
                "Не сейчас",
                "Ahora no",
                "Pas maintenant");

            Add("err.cancelled.title",
                "Okay, stopped",
                "Tamam, durduruldu",
                "Хорошо, остановлено",
                "Vale, detenido",
                "D'accord, arrêté");
            Add("err.cancelled.body",
                "Nothing was left half-done. Everything is back the way it was.",
                "Yarım kalan bir şey yok. Her şey eski haline döndü.",
                "Ничего не осталось недоделанным. Всё как было.",
                "No quedó nada a medias. Todo está como antes.",
                "Rien n'est resté à moitié fait. Tout est comme avant.");

            Add("err.permission.title",
                "Needs a bit more permission",
                "Biraz daha izin lazım",
                "Нужно чуть больше прав",
                "Faltan permisos",
                "Il faut un peu plus de droits");
            Add("err.permission.body",
                "Endcord can't write to '{0}'. Right-click the installer and choose Run as administrator.",
                "Endcord '{0}' konumuna yazamıyor. Kurulum dosyasına sağ tıklayıp Yönetici olarak çalıştır'ı seç.",
                "Endcord не может записать в «{0}». Нажмите правой кнопкой на установщик и выберите «Запуск от имени администратора».",
                "Endcord no puede escribir en '{0}'. Haz clic derecho en el instalador y elige Ejecutar como administrador.",
                "Endcord ne peut pas écrire dans « {0} ». Faites un clic droit sur l'installateur et choisissez Exécuter en tant qu'administrateur.");

            Add("err.locked.title",
                "Discord is still busy",
                "Discord hâlâ meşgul",
                "Discord ещё занят",
                "Discord sigue ocupado",
                "Discord est encore occupé");
            Add("err.locked.body",
                "'{0}' is still in use. Close Discord fully (check the tray too) and try again.",
                "'{0}' hâlâ kullanımda. Discord'u tamamen kapat (sistem tepsisine de bak) ve tekrar dene.",
                "«{0}» всё ещё занят. Полностью закройте Discord (проверьте и трей) и попробуйте снова.",
                "'{0}' sigue en uso. Cierra Discord del todo (mira también la bandeja) e inténtalo otra vez.",
                "« {0} » est encore utilisé. Fermez complètement Discord (vérifiez aussi la zone de notification) et réessayez.");

            Add("err.damaged.title",
                "This Discord looks broken",
                "Bu Discord bozuk görünüyor",
                "Этот Discord повреждён",
                "Este Discord parece roto",
                "Ce Discord semble cassé");
            Add("err.damaged.body",
                "{0} is missing its original 'app.asar' archive. Please reinstall {0} from discord.com first.",
                "{0} içinde orijinal 'app.asar' arşivi eksik. Lütfen önce discord.com'dan {0} sürümünü yeniden kurun.",
                "В {0} отсутствует архив «app.asar». Переустановите {0} с сайта discord.com.",
                "A {0} le falta 'app.asar'. Reinstala {0} desde discord.com primero.",
                "L'archive « app.asar » manque dans {0}. Réinstallez {0} depuis discord.com.");

            Add("err.generic.title",
                "Something went wrong",
                "Bir şeyler ters gitti",
                "Что-то пошло не так",
                "Algo salió mal",
                "Quelque chose a coincé");

            // ── Compatibility & Backup Reasons ───────────────────────────────
            Add("mig.reason.compatibleCore", "Compatible preference", "Uyumlu tercih", "Совместимая настройка", "Preferencia compatible", "Préférence compatible");
            Add("mig.reason.compatiblePlugin", "Supported plugin", "Desteklenen eklenti", "Поддерживаемый плагин", "Plugin compatible", "Plugin pris en charge");
            Add("mig.reason.compatibleCss", "QuickCSS stylesheet", "QuickCSS stil dosyası", "Стили QuickCSS", "Hoja QuickCSS", "Feuille QuickCSS");
            Add("mig.reason.compatibleTheme", "CSS Theme", "CSS Teması", "Тема CSS", "Tema CSS", "Thème CSS");
            Add("mig.reason.unsupportedPlugin", "Not in Endcord", "Endcord'da yok", "Нет в Endcord", "No está en Endcord", "Absent d'Endcord");
            Add("mig.reason.clientSpecificSetting", "Client-specific flag", "İstemciye özgü ayar", "Опция другого клиента", "Opción de otro cliente", "Option spécifique");
            Add("mig.reason.cloudAuth", "External cloud token (skipped)", "Harici bulut anahtarı (atlandı)", "Токен облака (пропущен)", "Token en la nube (omitido)", "Jeton cloud (ignoré)");
            Add("mig.reason.bdPluginFormat", "BetterDiscord JS incompatible", "BetterDiscord JS uyumsuz", "BD JS несовместим", "BD JS incompatible", "BD JS incompatible");
            Add("mig.reason.corruptJson", "Malformed JSON", "Bozuk JSON", "Ошибка JSON", "JSON dañado", "JSON corrompu");

            Add("backup.createBtn",
                "Save a snapshot",
                "Yedek al",
                "Сохранить копию",
                "Guardar copia",
                "Faire une copie");
            Add("backup.restoreBtn", "Restore", "Yükle", "Восстановить", "Restaurar", "Restaurer");
            Add("backup.empty",
                "No snapshots yet. One is saved automatically before any settings move.",
                "Henüz yedek yok. Ayarlar taşınmadan önce otomatik olarak alınır.",
                "Копий пока нет. Она создаётся автоматически перед переносом настроек.",
                "Aún no hay copias. Se guarda una automáticamente antes de mover ajustes.",
                "Pas encore de copie. Une est faite automatiquement avant tout transfert.");

            root["en"] = en;
            root["tr"] = tr;
            root["ru"] = ru;
            root["es"] = es;
            root["fr"] = fr;
            return root;
        }
    }
}
