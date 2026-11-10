const translations = {
  sw: {
    // Auth ...
    loginTitle: "Ingia Kwenye Akaunti",
    loginSub: "Ingia kusimamia msaidizi wako wa WhatsApp",
    emailPlaceholder: "Barua pepe (Email)",
    passwordPlaceholder: "Neno la siri (Password)",
    loginBtn: "Ingia",
    noAccount: "Huna akaunti?",
    registerHere: "Jisajili Hapa",
    forgotPass: "Umesahau password?",
    regTitle: "Tengeneza Akaunti Mpya",
    regSub: "Anza kutumia Msaidizi wa AI kwenye WhatsApp",
    regName: "Jina Lako au la Biashara/Duka",
    regPhone: "Namba ya WhatsApp Messenger (Sio Business, mfano: 255712345678)",
    regBtn: "Jisajili Sasa",
    haveAccount: "Tayari una akaunti?",
    loginHere: "Ingia Hapa",
    
    // Sidebar ...
    navOverview: "Muhtasari",
    navProducts: "Bidhaa",
    navOrders: "Oda",
    navConversations: "Mazungumzo",
    navInsights: "Ripoti za AI",
    navSettings: "Mipangilio",
    navSupport: "Msaada",
    navLogout: "Toka Nje",
    
    // Overview ...
    ovTitle: "Muhtasari",
    ovDesc: "Takwimu za haraka za duka lako",
    ovMonth: "Mwezi Huu",
    botSwitch: "Bot Switch",
    botOn: "Washa",
    botOff: "Zima",
    botSub: "Inajibu kiotomatiki",
    botSubPaused: "⏸️ Imesimamishwa — muuzaji anajibu mwenyewe",
    ovStatus: "Hali ya WhatsApp App",
    ovConnected: "Inatafuta hali ya WhatsApp...",
    ovQrOption1: "Chaguo 1: Scan QR code hii na WhatsApp ya simu yako:",
    ovQrOption2: "Chaguo 2: Tumia Namba ya Simu (Pairing Code)",
    ovQrDesc: "Kama unatumia simu hii hii, weka namba yako hapa upate code ya kupaste kwenye WhatsApp (Linked Devices > Link with phone number).",
    ovGetCode: "Pata Code",
    ovRestart: "Anzisha WhatsApp Upya",
    ovQuickStats: "Takwimu za Haraka (Quick Stats)",
    statProducts: "Jumla ya Bidhaa",
    statOrders: "Jumla ya Oda",
    statCustomers: "Jumla ya Wateja",
    statPending: "Pending",
    statReEngaged: "Re-engaged",
    
    // JS Alerts & Toasts
    alertTerms: "Tafadhali fungua Vigezo na Masharti, usome mpaka mwisho, kisha ubofye 'Nimesoma & Ninakubali'.",
    alertErr: "Kosa: ",
    alertFailEdit: "Imeshindwa kubadilisha: ",
    alertNoCategory: "Tafadhali chagua au andika category.",
    alertNoPhone: "Tafadhali weka namba ya simu (mfano: 255712345678).",
    alertAccountDeleted: "Akaunti yako imefutwa kikamilifu. Tunasikitika kukuona ukiondoka.",
    alertPushNotSupported: "Browser yako hairuhusu Push Notifications.",
    alertPushEnabled: "Safi! Sasa utapata taarifa (Pop-ups) za oda mpya hata kama Dashboard ipo background.",
    alertPushDenied: "Umekataa kuruhusu Notifications. Kama unataka, utahitaji kubadili kwenye settings za Browser yako.",
    toastOrderNotified: "Mteja amearifiwa kuwa oda #",
    toastOrderNotNotified: "Status imebadilishwa, lakini mteja HAJAARIFIWA (WhatsApp haijaunganishwa?) ⚠️",
    toastSrNotified: "Mteja amearifiwa kikamilifu kuhusu ombi #SR-",
    toastSrUpdated: "Ombi limesasishwa. (Hakuna ujumbe wa mteja kwa status hii) 💾",
    
    // Empty & Loading States
    emptyConversations: "Hakuna mazungumzo bado.",
    emptyMessages: "Hakuna meseji bado.",
    emptySpecialRequests: "Hakuna maombi maalum bado.",
    emptyIntent: "Hakuna wateja wenye nia dhahiri kwa sasa - jaribu tena baadaye.",
    emptyNudges: "Hakuna mteja aliyetumwa nudge bado — mfumo unakagua na kutuma kiotomatiki kila saa.",
    loading: "Inapakia...",
    loadingChats: "Inapakia mazungumzo...",
    loadingSettings: "⏳ Inapakia mipangilio...",
    
    // Statuses & Options
    optPending: "Pending",
    optPaid: "Imelipiwa (Paid)",
    optConfirmed: "Imethibitishwa",
    optDelivered: "Imefikishwa",
    optCancelled: "Imeghairiwa",
    srNew: "🆕 Mpya",
    srSourcing: "🔎 Inatafutwa",
    srFound: "✅ Imepatikana",
    srFulfilled: "📦 Imetimizwa",
    srCancelled: "❌ Imeghairiwa",
    addCategory: "+ Ongeza Category Mpya...",
    promptCategory: "Andika jina la category mpya:",
    pushNewOrderTitle: "🎉 Oda Mpya Imepatikana!",
    pushNewOrderDesc: "Kuna oda {n} mpya zimeingia sasa hivi. Fungua dashboard kuzihudumia.",
    
    // Actions & More
    fetchQr: "Inatafuta QR Code...",
    btnDelete: "Futa",
    fetching: "Inatafuta...",
    deleting: "Inafuta...",
    deleting: "Inafuta...",
    failDelete: "Imeshindwa kufuta akaunti.",
    btnDeleteAccount: "Ndiyo, Futa Akaunti",
    btnEdit: "Hariri",
    editProduct: "Hariri Bidhaa",
    addProduct: "Ongeza Bidhaa",
    botFriend: "👤 Rafiki (AI Imezimwa)",
    botCustomer: "🛒 Mteja (AI Inajibu)",
    
    // WhatsApp Connection
    statusTimeoutBadge: "Muda Umeisha",
    statusTimeoutDesc: "⏳ Muda wa kuscan/kupair umekwisha (Dakika 2). Tafadhali bofya 'Unganisha WhatsApp' ili kuanza upya.",
    btnConnectWa: "Unganisha WhatsApp",
    statusConnectedBadge: "Imeunganishwa",
    statusConnectedDesc: "✅ WhatsApp imeunganishwa kikamilifu! Msaidizi wa AI anaweza kupokea na kujibu wateja sasa.",
    statusConnectingBadge: "Inaunganisha",
    statusConnectingDesc: "⏳ Inajaribu kuunganisha na WhatsApp. Tafadhali subiri kidogo...",
    statusQrBadge: "Scan QR",
    statusQrDesc: "📱 QR code ipo tayari. Scan na simu yako ili kuunganisha kifaa.",
    statusDiscBadge: "Imekatika",
    statusDiscDesc: "❌ Muunganiko wa WhatsApp umekatika au namba yako haijaunganishwa bado.",
    statusErrorDesc: "⚠️ Imeshindwa kuwasiliana na server kuangalia hali ya WhatsApp.",
    btnRetry: "Jaribu Upya",
    btnConnecting: "Inaunganisha...",
    statusStartingWa: "⏳ Kujaribu kuanzisha muunganiko wa WhatsApp...",
    statusFailConnect: "⚠️ Imeshindwa kuunganisha: ",
    statSpecial: "Special",
    
    // Products ...
    prodTitle: "Orodha ya Bidhaa",
    prodDesc: "Bidhaa unazouza ambazo AI inaweza kuzitolea maelezo kwa wateja",
    prodAddBtn: "➕ Ongeza Bidhaa",
    prodThImg: "Picha",
    prodThName: "Jina",
    prodThCat: "Category",
    prodThPrice: "Bei (TZS)",
    prodThStock: "Stock",
    prodThColor: "Rangi",
    prodThSize: "Size",
    prodThStatus: "Hali",
    prodThActions: "Vitendo",
    
    // Orders
    ordTitle: "Oda na Malipo",
    ordDesc: "Fuatilia oda zote zinazotoka kwa wateja",
    ordExportBtn: "📥 Pakua PDF / Excel",
    ordThId: "Oda ID",
    ordThCust: "Mteja",
    ordThAmount: "Kiasi",
    ordThDate: "Tarehe",
    ordThStatus: "Status",
    ordThActions: "Vitendo",
    
    // Conversations
    convTitle: "Mazungumzo",
    convDesc: "Ona wateja wanaowasiliana na AI hivi sasa",
    convSearchPlaceholder: "🔍 Tafuta namba (mfano: 2557...)",
    
    // Insights
    insTitle: "Ripoti na Uchambuzi wa AI",
    insDesc: "AI inakuchambulia mienendo ya wateja na kukuandalia ufupisho",
    insSummaryTitle: "Ufupisho wa Wiki Hii (AI Summary)",
    insSummaryEmpty: "Takwimu hazitoshi kuunda ufupisho. AI itaandika ripoti kadiri wateja wanavyoongezeka.",
    insTrendTitle: "Mienendo (Trends) Kutoka kwa Wateja",
    insTrendEmpty: "Hakuna mienendo iliyogundulika bado.",
    insActionTitle: "Mapendekezo ya AI Kwako (Actionable Insights)",
    insActionEmpty: "Hakuna mapendekezo kwa sasa.",
    insConvRateTitle: "Wateja Waliolipa (%)",
    
    // Settings
    setLanguageTitle: "Lugha / Language",
    setLanguageDesc: "Chagua lugha ya mfumo (System Language)",
    langSw: "Kiswahili",
    langEn: "English",
    setBizContextTitle: "Business Context & Rules",
    setBizContextDesc: "Mpe AI maelezo ya kina kuhusu duka lako",
    setBizNameLabel: "Jina la Duka/Biashara",
    setBizInfoLabel: "Maelezo ya Biashara (Context)",
    setDeliveryLabel: "Sera ya Usafirishaji (Delivery)",
    setToneLabel: "Lugha ya AI (Tone)",
    setToneOptFriendly: "Kawaida, Kirafiki (Friendly)",
    setToneOptPro: "Rasmi, Kibiashara (Professional)",
    setToneOptFunny: "Kuchekesha, Vichekesho (Humorous)",
    setToneOptPersuasive: "Ushawishi wa Kisales (Persuasive/Salesy)",
    setPromptLabel: "Maelekezo Maalum (Custom Instructions)",
    setPromptPlaceholder: "Mfano: Usipunguze bei zaidi ya asilimia 10...",
    setSaveBtn: "💾 Hifadhi Mipangilio",
    setDelTitle: "Futa Akaunti / Delete Account",
    setDelDesc: "Onyo: Ukifuta akaunti yako, data zako zote (bidhaa, oda, na mazungumzo) zitafutwa kabisa na hazitaweza kurudishwa tena.",
    setDelBtn: "🗑️ Futa Akaunti Yangu Moja kwa Moja",
    
    // Support
    supTitle: "Msaada (Support)",
    supDesc: "Wasiliana nasi au pata msaada",
    supDocTitle: "Nyaraka (Documentation)",
    supDocDesc: "Soma mwongozo wa jinsi ya kutumia mfumo huu kikamilifu.",
    supDocBtn: "Soma Mwongozo",
    supWaTitle: "Wasiliana Nasi (WhatsApp)",
    supWaDesc: "Tutumie ujumbe WhatsApp kwa msaada wa haraka au maoni.",
    supWaBtn: "Tuma Ujumbe",
    supPushTitle: "Ruhusu Notifications (Push)",
    supPushDesc: "Bonyeza hapa ili kuruhusu kupata taarifa za oda mpya.",
    supPushBtn: "Ruhusu Alerts",

    // Usalama wa Namba (Number Health)
    statusBannedBadge: "Imefungiwa",
    statusBannedDesc: "🚫 WhatsApp imefungia namba hii. AI imesimamishwa. Omba ukaguzi kwenye WhatsApp ya simu yako; ikirudishwa, bofya 'Unganisha Namba Upya'.",
    btnRelinkWa: "Unganisha Namba Upya",
    nhTitle: "Usalama wa Namba",
    nhBannedTitle: "🚫 WhatsApp imefungia namba hii",
    nhBannedDesc: "AI imesimamishwa na mfumo hautaunganisha namba hii tena kiotomatiki. Fungua WhatsApp kwenye simu yako na uombe ukaguzi (“Request a review”). Ikirudishwa, bofya “Unganisha Namba Upya” hapo juu.",
    nhSentToday: "Ujumbe uliotumwa leo",
    nhReminders: "Vikumbusho (nudges) leo",
    nhRemindersHint: "Vikumbusho vinasimama vyenyewe kikomo kikikaribia.",
    nhWarmup: "Warm-up",
    nhOptedOut: "Wamejiondoa (STOP)",
    nhNeedsHuman: "Wanakusubiri wewe",
    nhQueue: "Foleni",
    nhTipsTitle: "💡 Jinsi ya kulinda namba yako isifungiwe",
    nhTip1: "Namba hufungiwa zaidi wateja wakibofya “Block” au “Report”. Jibu wanaokuandikia tu - usitume ujumbe kwa watu wasiokujua.",
    nhTip2: "Mteja akiandika STOP au ACHA, mfumo unaacha kumtumia vikumbusho kiotomatiki.",
    nhTip3: "Namba mpya inaanza na kikomo kidogo cha ujumbe kwa siku na kinaongezeka polepole kwa wiki 2.",
    nhTip4: "Usitumie namba hii kwenye mifumo mingine ya bulk/broadcast kwa wakati mmoja.",
    nhTip5: "Biashara kubwa: fikiria WhatsApp Business API rasmi - haina hatari ya kufungiwa kwa sababu ya muunganiko.",
    nhLevelSafe: "Salama",
    nhLevelWarn: "Karibu na kikomo",
    nhLevelLimit: "Kikomo kimefika",
    nhLevelBanned: "Imefungiwa",
    nhLevelOffline: "Haijaunganishwa",
    nhHintOk: "Zimebaki {n} leo. Kikomo kinaanza upya saa 6 usiku.",
    nhHintFull: "Kikomo cha leo kimefika - AI imesimama hadi kesho ili kulinda namba. Ujumbe mpya unahifadhiwa kwenye Mazungumzo.",
    nhWarmupStage: "Hatua {s}/{t} · siku {d}",
    nhWarmupNext: "kikomo kinaongezeka baada ya siku {n}",
    nhWarmupDone: "Imekamilika",
    nhWarmupCustom: "Kikomo maalum",
    convFilterAll: "Wote",
    convFilterNeedsHuman: "🙋 Wanakusubiri",
    convFilterOptedOut: "🔕 Wamejiondoa",
    convBadgeOptedOut: "Amejiondoa",
    convBadgeNeedsHuman: "Anahitaji Mmiliki",
    convReplyPlaceholder: "Mjibu mteja mwenyewe...",
    convReplySend: "Tuma",
    convReplySending: "Inatuma...",
    convTakeOver: "🙋 Nitajibu Mwenyewe",
    convGiveBack: "🤖 Rudisha kwa AI",
    convHandoffHint: "AI imesimama kwa mteja huyu - unajibu wewe mwenyewe.",
    convSearchEmpty: "Hakuna mazungumzo yanayolingana.",

    // V2: WhatsApp Cloud API
    cloudTitle: "WhatsApp Connections (Meta)",
    cloudConnect: "Unganisha WhatsApp",
    cloudReconnect: "Unganisha upya",
    cloudDisconnect: "Kata muunganiko",
    cloudDisconnectConfirm: "Kata muunganiko wa namba hii? AI itaacha kujibu wateja kupitia namba hii.",
    cloudPendingApproval: "Kuunganisha kupitia Meta kunasubiri idhini. Wasiliana na msimamizi kukuunganisha.",
    cloudNone: "Bado hujaunganisha namba kupitia WhatsApp Cloud API.",
    cloudStatusConnected: "Imeunganishwa",
    cloudStatusError: "Kuna tatizo",
    cloudStatusSuspended: "Imesimamishwa",
    cloudStatusDisconnected: "Imekatwa",
    cloudStatusPending: "Inasubiri",
    cloudLastConnected: "Iliunganishwa",
    cloudQuality: "Ubora",
    cloudPhoneId: "Phone Number ID",
    cloudErrTokenExpired: "Ruhusa ya Meta imeisha muda. Bofya 'Unganisha upya'.",
    cloudErrTokenInvalid: "Meta imekataa ruhusa ya namba hii. Bofya 'Unganisha upya'.",
    cloudSignupCancelled: "Umesitisha kuunganisha. Unaweza kujaribu tena wakati wowote.",
    cloudSignupFailed: "Kuunganisha kumeshindwa: ",
    cloudSignupSuccess: "WhatsApp imeunganishwa kikamilifu! ✅",
    cloudUsageIn: "Ujumbe ulioingia (siku 7)",
    cloudUsageOut: "Ujumbe uliotumwa (siku 7)",
    cloudUsageTemplates: "Templates (siku 7)",
    cloudTemplatesTitle: "📄 Templates (ujumbe nje ya saa 24)",
    cloudTemplatesHint: "WhatsApp inaruhusu ujumbe wa kawaida ndani ya saa 24 tangu mteja aandike. Baada ya hapo, taarifa za oda zinatumwa kwa template iliyoidhinishwa na Meta (yenye kigezo kimoja {{1}}).",
    cloudSyncTemplates: "🔄 Pakua templates kutoka Meta",
    cloudNoTemplates: "Hakuna templates bado.",
    cloudPurposeNone: "— Haitumiki —",
    cloudPurpose_order_update: "Taarifa za oda",
    cloudPurpose_special_request: "Maombi maalum",
    cloudPurpose_reengagement: "Ukumbusho (marketing)",
    cloudPurpose_otp: "OTP",
  },
  en: {
    // Auth ...
    loginTitle: "Sign In",
    loginSub: "Login to manage your WhatsApp AI assistant",
    emailPlaceholder: "Email Address",
    passwordPlaceholder: "Password",
    loginBtn: "Sign In",
    noAccount: "Don't have an account?",
    registerHere: "Register Here",
    forgotPass: "Forgot password?",
    regTitle: "Create New Account",
    regSub: "Start using AI Assistant on your WhatsApp",
    regName: "Your Name or Business Name",
    regPhone: "WhatsApp Messenger Number (Not Business, e.g., 255712345678)",
    regBtn: "Register Now",
    haveAccount: "Already have an account?",
    loginHere: "Sign In Here",
    
    // Sidebar ...
    navOverview: "Overview",
    navProducts: "Products",
    navOrders: "Orders",
    navConversations: "Conversations",
    navInsights: "AI Insights",
    navSettings: "Settings",
    navSupport: "Support",
    navLogout: "Log Out",
    
    // Overview ...
    ovTitle: "Overview",
    ovDesc: "Quick stats for your store",
    ovMonth: "This Month",
    botSwitch: "Bot Switch",
    botOn: "ON",
    botOff: "OFF",
    botSub: "Auto-replying",
    botSubPaused: "⏸️ Paused — merchant replies manually",
    ovStatus: "WhatsApp App Status",
    ovConnected: "Checking WhatsApp status...",
    ovQrOption1: "Option 1: Scan this QR code with your WhatsApp:",
    ovQrOption2: "Option 2: Use Phone Number (Pairing Code)",
    ovQrDesc: "If using this phone, enter your number to get a pairing code to paste in WhatsApp (Linked Devices > Link with phone number).",
    ovGetCode: "Get Code",
    ovRestart: "Restart WhatsApp",
    ovQuickStats: "Quick Stats",
    statProducts: "Total Products",
    statOrders: "Total Orders",
    statCustomers: "Total Customers",
    statPending: "Pending",
    statReEngaged: "Re-engaged",
    statSpecial: "Special",
    
    // Products ...
    prodTitle: "Product List",
    prodDesc: "Products you sell that AI can explain to customers",
    prodAddBtn: "➕ Add Product",
    prodThImg: "Image",
    prodThName: "Name",
    prodThCat: "Category",
    prodThPrice: "Price (TZS)",
    prodThStock: "Stock",
    prodThColor: "Color",
    prodThSize: "Size",
    prodThStatus: "Status",
    prodThActions: "Actions",
    
    // Orders
    ordTitle: "Orders & Payments",
    ordDesc: "Track all orders coming from customers",
    ordExportBtn: "📥 Download PDF / Excel",
    ordThId: "Order ID",
    ordThCust: "Customer",
    ordThAmount: "Amount",
    ordThDate: "Date",
    ordThStatus: "Status",
    ordThActions: "Actions",
    
    // Conversations
    convTitle: "Conversations",
    convDesc: "View customers interacting with AI right now",
    convSearchPlaceholder: "🔍 Search number (e.g. 2557...)",
    
    // Insights
    insTitle: "AI Insights & Reports",
    insDesc: "AI analyzes customer trends and prepares summaries for you",
    insSummaryTitle: "This Week's Summary (AI)",
    insSummaryEmpty: "Not enough data to create a summary. AI will generate a report as customers increase.",
    insTrendTitle: "Customer Trends",
    insTrendEmpty: "No trends identified yet.",
    insActionTitle: "Actionable Insights",
    insActionEmpty: "No recommendations at this time.",
    insConvRateTitle: "Paid Customers (%)",
    
    // Settings
    setLanguageTitle: "Language",
    setLanguageDesc: "Choose system language",
    langSw: "Swahili",
    langEn: "English",
    setBizContextTitle: "Business Context & Rules",
    setBizContextDesc: "Give AI detailed information about your store",
    setBizNameLabel: "Store/Business Name",
    setBizInfoLabel: "Business Description (Context)",
    setDeliveryLabel: "Shipping Policy (Delivery)",
    setToneLabel: "AI Tone",
    setToneOptFriendly: "Friendly & Casual",
    setToneOptPro: "Professional & Formal",
    setToneOptFunny: "Humorous & Fun",
    setToneOptPersuasive: "Persuasive / Salesy",
    setPromptLabel: "Custom Instructions",
    setPromptPlaceholder: "e.g., Do not give discounts more than 10%...",
    setSaveBtn: "💾 Save Settings",
    setDelTitle: "Delete Account",
    setDelDesc: "Warning: Deleting your account will permanently remove all your data (products, orders, conversations) and it cannot be recovered.",
    setDelBtn: "🗑️ Permanently Delete My Account",
    
    // Support
    supTitle: "Support",
    supDesc: "Contact us or get help",
    supDocTitle: "Documentation",
    supDocDesc: "Read the manual on how to use this system fully.",
    supDocBtn: "Read Guide",
    supWaTitle: "Contact Us (WhatsApp)",
    supWaDesc: "Send us a WhatsApp message for quick help or feedback.",
    supWaBtn: "Send Message",
    supPushTitle: "Enable Push Notifications",
    supPushDesc: "Click here to allow notifications for new orders.",
    supPushBtn: "Allow Alerts",
    
    // JS Alerts & Toasts
    alertTerms: "Please open Terms & Conditions, read to the end, then click 'I have read & agree'.",
    alertErr: "Error: ",
    alertFailEdit: "Failed to modify: ",
    alertNoCategory: "Please select or type a category.",
    alertNoPhone: "Please enter phone number (e.g. 255712345678).",
    alertAccountDeleted: "Your account has been permanently deleted. We are sorry to see you go.",
    alertPushNotSupported: "Your browser does not support Push Notifications.",
    alertPushEnabled: "Great! You will now receive popup alerts for new orders even in the background.",
    alertPushDenied: "You denied Notifications. To change this, update your Browser settings.",
    toastOrderNotified: "Customer has been notified that order #",
    toastOrderNotNotified: "Status changed, but customer NOT NOTIFIED (WhatsApp disconnected?) ⚠️",
    toastSrNotified: "Customer fully notified about request #SR-",
    toastSrUpdated: "Request updated. (No message sent for this status) 💾",
    
    // Empty & Loading States
    emptyConversations: "No conversations yet.",
    emptyMessages: "No messages yet.",
    emptySpecialRequests: "No special requests yet.",
    emptyIntent: "No customers with strong intent right now - try again later.",
    emptyNudges: "No customers nudged yet — the system checks and nudges automatically every hour.",
    loading: "Loading...",
    loadingChats: "Loading conversations...",
    loadingSettings: "⏳ Loading settings...",
    
    // Statuses & Options
    optPending: "Pending",
    optPaid: "Paid",
    optConfirmed: "Confirmed",
    optDelivered: "Delivered",
    optCancelled: "Cancelled",
    srNew: "🆕 New",
    srSourcing: "🔎 Sourcing",
    srFound: "✅ Found",
    srFulfilled: "📦 Fulfilled",
    srCancelled: "❌ Cancelled",
    addCategory: "+ Add New Category...",
    promptCategory: "Enter new category name:",
    pushNewOrderTitle: "🎉 New Order Received!",
    pushNewOrderDesc: "There are {n} new orders. Open dashboard to process them.",
    
    // Actions & More
    fetchQr: "Fetching QR Code...",
    btnDelete: "Delete",
    fetching: "Fetching...",
    deleting: "Deleting...",
    deleting: "Deleting...",
    failDelete: "Failed to delete account.",
    btnDeleteAccount: "Yes, Delete Account",
    btnEdit: "Edit",
    editProduct: "Edit Product",
    addProduct: "Add Product",
    botFriend: "👤 Friend (AI Off)",
    botCustomer: "🛒 Customer (AI On)",
    
    // WhatsApp Connection
    statusTimeoutBadge: "Timeout",
    statusTimeoutDesc: "⏳ Time to scan/pair has expired (2 mins). Please click 'Connect WhatsApp' to start again.",
    btnConnectWa: "Connect WhatsApp",
    statusConnectedBadge: "Connected",
    statusConnectedDesc: "✅ WhatsApp is successfully connected! AI Assistant can now receive and reply to customers.",
    statusConnectingBadge: "Connecting",
    statusConnectingDesc: "⏳ Trying to connect to WhatsApp. Please wait a moment...",
    statusQrBadge: "Scan QR",
    statusQrDesc: "📱 QR code is ready. Scan with your phone to link device.",
    statusDiscBadge: "Disconnected",
    statusDiscDesc: "❌ WhatsApp connection is lost or your number is not connected yet.",
    statusErrorDesc: "⚠️ Failed to communicate with server to check WhatsApp status.",
    btnRetry: "Retry",
    btnConnecting: "Connecting...",
    statusStartingWa: "⏳ Attempting to start WhatsApp connection...",
    statusFailConnect: "⚠️ Failed to connect: ",

    // Number Health
    statusBannedBadge: "Banned",
    statusBannedDesc: "🚫 WhatsApp has banned this number. The AI is stopped. Request a review in WhatsApp on your phone; if it is restored, click 'Re-link Number'.",
    btnRelinkWa: "Re-link Number",
    nhTitle: "Number Safety",
    nhBannedTitle: "🚫 WhatsApp has banned this number",
    nhBannedDesc: "The AI is stopped and the system will not reconnect this number automatically. Open WhatsApp on your phone and tap “Request a review”. If it is restored, click “Re-link Number” above.",
    nhSentToday: "Messages sent today",
    nhReminders: "Reminders (nudges) today",
    nhRemindersHint: "Reminders pause automatically before you reach the daily limit.",
    nhWarmup: "Warm-up",
    nhOptedOut: "Opted out (STOP)",
    nhNeedsHuman: "Waiting for you",
    nhQueue: "Queue",
    nhTipsTitle: "💡 How to keep your number from being banned",
    nhTip1: "Numbers get banned mostly when customers tap “Block” or “Report”. Only reply to people who message you - never message strangers.",
    nhTip2: "When a customer writes STOP or ACHA, the system stops sending them reminders automatically.",
    nhTip3: "A newly linked number starts with a small daily limit that grows over 2 weeks.",
    nhTip4: "Don't connect this number to other bulk/broadcast tools at the same time.",
    nhTip5: "For larger businesses: consider the official WhatsApp Business API - it has no ban risk from the connection method.",
    nhLevelSafe: "Safe",
    nhLevelWarn: "Near limit",
    nhLevelLimit: "Limit reached",
    nhLevelBanned: "Banned",
    nhLevelOffline: "Not connected",
    nhHintOk: "{n} left today. The limit resets at midnight (EAT).",
    nhHintFull: "Today's limit is reached - the AI is paused until tomorrow to protect your number. New messages are saved in Conversations.",
    nhWarmupStage: "Stage {s}/{t} · day {d}",
    nhWarmupNext: "limit increases in {n} days",
    nhWarmupDone: "Complete",
    nhWarmupCustom: "Custom limit",
    convFilterAll: "All",
    convFilterNeedsHuman: "🙋 Waiting for you",
    convFilterOptedOut: "🔕 Opted out",
    convBadgeOptedOut: "Opted out",
    convBadgeNeedsHuman: "Needs owner",
    convReplyPlaceholder: "Reply to the customer yourself...",
    convReplySend: "Send",
    convReplySending: "Sending...",
    convTakeOver: "🙋 I'll reply myself",
    convGiveBack: "🤖 Hand back to AI",
    convHandoffHint: "The AI is paused for this customer - you are replying yourself.",
    convSearchEmpty: "No matching conversations.",

    // V2: WhatsApp Cloud API
    cloudTitle: "WhatsApp Connections (Meta)",
    cloudConnect: "Connect WhatsApp",
    cloudReconnect: "Reconnect",
    cloudDisconnect: "Disconnect",
    cloudDisconnectConfirm: "Disconnect this number? The AI will stop answering customers on it.",
    cloudPendingApproval: "Connecting through Meta is awaiting approval. Contact the administrator to connect you.",
    cloudNone: "You have not connected a number through WhatsApp Cloud API yet.",
    cloudStatusConnected: "Connected",
    cloudStatusError: "Needs attention",
    cloudStatusSuspended: "Suspended",
    cloudStatusDisconnected: "Disconnected",
    cloudStatusPending: "Pending",
    cloudLastConnected: "Connected",
    cloudQuality: "Quality",
    cloudPhoneId: "Phone Number ID",
    cloudErrTokenExpired: "Meta permission has expired. Click 'Reconnect'.",
    cloudErrTokenInvalid: "Meta rejected this number's permission. Click 'Reconnect'.",
    cloudSignupCancelled: "Connection cancelled. You can try again any time.",
    cloudSignupFailed: "Connection failed: ",
    cloudSignupSuccess: "WhatsApp connected successfully! ✅",
    cloudUsageIn: "Messages received (7 days)",
    cloudUsageOut: "Messages sent (7 days)",
    cloudUsageTemplates: "Templates (7 days)",
    cloudTemplatesTitle: "📄 Templates (messages after 24 hours)",
    cloudTemplatesHint: "WhatsApp allows normal messages within 24 hours of the customer's last message. After that, order updates are sent with a Meta-approved template (with one {{1}} variable).",
    cloudSyncTemplates: "🔄 Download templates from Meta",
    cloudNoTemplates: "No templates yet.",
    cloudPurposeNone: "— Not used —",
    cloudPurpose_order_update: "Order updates",
    cloudPurpose_special_request: "Special requests",
    cloudPurpose_reengagement: "Reminders (marketing)",
    cloudPurpose_otp: "OTP",
  }
};

let currentLang = localStorage.getItem('merchant_lang') || 'en';

function t(key) {
  if (translations[currentLang] && translations[currentLang][key]) {
    return translations[currentLang][key];
  }
  return key;
}

function setLanguage(lang) {
  if (!['sw', 'en'].includes(lang)) return;
  currentLang = lang;
  localStorage.setItem('merchant_lang', lang);
  applyTranslations();
  
  // Update toggle buttons if they exist
  const btnSw = document.getElementById('langBtnSw');
  const btnEn = document.getElementById('langBtnEn');
  if (btnSw && btnEn) {
    if (lang === 'sw') {
      btnSw.classList.add('btn-primary');
      btnSw.classList.remove('btn-ghost');
      btnEn.classList.add('btn-ghost');
      btnEn.classList.remove('btn-primary');
    } else {
      btnEn.classList.add('btn-primary');
      btnEn.classList.remove('btn-ghost');
      btnSw.classList.add('btn-ghost');
      btnSw.classList.remove('btn-primary');
    }
  }
}

function applyTranslations() {
  const elements = document.querySelectorAll('[data-i18n]');
  elements.forEach(el => {
    const key = el.getAttribute('data-i18n');
    const text = t(key);
    
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      if (el.getAttribute('placeholder') !== null) {
        el.setAttribute('placeholder', text);
      } else if (el.type === 'button' || el.type === 'submit') {
        el.value = text;
      }
    } else {
      el.innerHTML = text;
    }
  });
}

// Export for app.js if needed (for module systems), but here it's global
window.t = t;
window.setLanguage = setLanguage;
window.applyTranslations = applyTranslations;
