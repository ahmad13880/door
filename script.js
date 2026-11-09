
let serialPort = null;
let reader = null;
let isReading = false;

let receivedLogs = [];
let receivedInvoices = [];
let maintenanceEnabled = false;
let currentCard = null;

const connectButton = document.getElementById("connectButton");
const disconnectButton = document.getElementById("disconnectButton");

const systemStatus = document.getElementById("systemStatus");
const serialMessage = document.getElementById("serialMessage");

const balanceValue = document.getElementById("balanceValue");
const passengerValue = document.getElementById("passengerValue");

const logsTable = document.getElementById("logsTable");
const dataMessage = document.getElementById("dataMessage");

const openGateButton = document.getElementById("openGateButton");
const closeGateButton = document.getElementById("closeGateButton");
const sellTicketButton = document.getElementById("sellTicketButton");
const addBalanceButton = document.getElementById("addBalanceButton");
const deductBalanceButton = document.getElementById("deductBalanceButton");
const maintenanceButton = document.getElementById("maintenanceButton");
const controlMessage = document.getElementById("controlMessage");

// بطاقة RFID
const cardLoginMessage = document.getElementById("cardLoginMessage");
const cardAccount = document.getElementById("cardAccount");
const cardOwnerName = document.getElementById("cardOwnerName");
const cardTypeBadge = document.getElementById("cardTypeBadge");
const cardCode = document.getElementById("cardCode");
const cardUID = document.getElementById("cardUID");
const cardBalance = document.getElementById("cardBalance");
const cardTrips = document.getElementById("cardTrips");
const cardMode = document.getElementById("cardMode");
const cardExpiry = document.getElementById("cardExpiry");

// الفواتير والإحصائيات
const invoicesTable = document.getElementById("invoicesTable");
const invoiceCountValue = document.getElementById("invoiceCountValue");
const revenueValue = document.getElementById("revenueValue");
const deniedValue = document.getElementById("deniedValue");
const rechargeValue = document.getElementById("rechargeValue");

const processedInvoiceIds = new Set();

connectButton?.addEventListener("click", connectSerial);
disconnectButton?.addEventListener("click", disconnectSerial);

function setControlButtons(enabled) {
    if (openGateButton) openGateButton.disabled = !enabled;
    if (closeGateButton) closeGateButton.disabled = !enabled;
    if (sellTicketButton) sellTicketButton.disabled = !enabled;
    if (addBalanceButton) addBalanceButton.disabled = !enabled;
    if (deductBalanceButton) deductBalanceButton.disabled = !enabled;
    if (maintenanceButton) maintenanceButton.disabled = !enabled;
}

async function connectSerial() {
    if (!("serial" in navigator)) {
        serialMessage.textContent =
            "متصفحك لا يدعم الاتصال التسلسلي. استخدم Chrome أو Edge.";
        return;
    }

    try {
        serialPort = await navigator.serial.requestPort();
        await serialPort.open({ baudRate: 9600 });

        connectButton.disabled = true;
        disconnectButton.disabled = false;

        setControlButtons(true);

        systemStatus.textContent = "متصل";
        serialMessage.textContent = "تم الاتصال بالأردوينو بنجاح";
        dataMessage.textContent = "في انتظار بيانات المحطة...";

        isReading = true;
        readSerialData();

    } catch (error) {
        console.error(error);
        serialMessage.textContent = "فشل الاتصال: " + error.message;
    }
}

async function readSerialData() {
    let buffer = "";
    const decoder = new TextDecoder();

    try {
        while (serialPort && serialPort.readable && isReading) {
            reader = serialPort.readable.getReader();

            try {
                while (isReading) {
                    const { value, done } = await reader.read();

                    if (done) break;

                    if (value) {
                        buffer += decoder.decode(value, { stream: true });

                        const lines = buffer.split("\n");
                        buffer = lines.pop();

                        for (const line of lines) {
                            processArduinoMessage(line.trim());
                        }
                    }
                }
            } finally {
                reader.releaseLock();
                reader = null;
            }
        }
    } catch (error) {
        if (isReading) {
            console.error(error);
            serialMessage.textContent =
                "انقطع الاتصال: " + error.message;

            setControlButtons(false);
            systemStatus.textContent = "غير متصل";
        }
    }
}

function processArduinoMessage(message) {
    if (!message.startsWith("MC|")) return;

    const parts = message.split("|");
    const messageType = parts[1];

    if (messageType === "STATUS") {
        updateStatus(parts);
    }

    if (messageType === "LOG") {
        addLog(parts);
    }

    if (messageType === "TICKET") {
        addInvoice(parts);
    }

    if (messageType === "CARD") {
        handleCardScan(parts);
    }

    if (messageType === "ACK") {
        handleAcknowledgement(parts);
    }
}

function updateStatus(parts) {
    const balance = Number(parts[2]);
    const passengers = Number(parts[3]);

    if (Number.isFinite(balance)) {
        balanceValue.textContent =
            balance.toLocaleString("ar-SA");
    }

    if (Number.isFinite(passengers)) {
        passengerValue.textContent =
            passengers.toLocaleString("ar-SA");
    }

    maintenanceEnabled = parts[4] === "1";

    dataMessage.textContent = maintenanceEnabled
        ? "المحطة في وضع الصيانة"
        : "بيانات المحطة تصل بشكل طبيعي";

    maintenanceButton.textContent = maintenanceEnabled
        ? "إيقاف وضع الصيانة"
        : "تشغيل وضع الصيانة";
}

async function handleCardScan(parts) {
    const uid = String(parts[2] || "")
        .replace(/[^a-fA-F0-9]/g, "")
        .toUpperCase();

    if (!/^[A-F0-9]{8,20}$/.test(uid)) {
        showCardMessage("رقم البطاقة غير صالح", "error");
        return;
    }

    showCardMessage("جاري التحقق من البطاقة...", "");
    cardAccount.hidden = true;

    try {
        const response = await fetch(
            "/.netlify/functions/card-login",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ uid })
            }
        );

        const result = await response.json();

        if (!response.ok || !result.success) {
            currentCard = null;
            showCardMessage(
                result.message || "تعذر تسجيل الدخول",
                "error"
            );
            return;
        }

        currentCard = result.card;

        displayCardAccount(currentCard, uid);

        showCardMessage(
            "تم التعرف على البطاقة بنجاح",
            "success"
        );

    } catch (error) {
        console.error("Card login error:", error);

        currentCard = null;

        showCardMessage(
            "تعذر الاتصال بخدمة البطاقات. تحقق من نشر الموقع والاتصال بالإنترنت.",
            "error"
        );
    }
}

function displayCardAccount(card, uid) {
    cardAccount.hidden = false;

    cardOwnerName.textContent = card.name || "---";
    cardTypeBadge.textContent = card.type || "---";
    cardCode.textContent = card.code || "---";
    cardUID.textContent = uid;

    cardBalance.textContent =
        card.balance === null || card.balance === undefined
            ? "غير محدد"
            : Number(card.balance).toLocaleString("ar-SA") + " ريال";

    cardTrips.textContent =
        card.tripsRemaining === null ||
        card.tripsRemaining === undefined
            ? "غير محدد"
            : card.tripsRemaining;

    cardMode.textContent =
        card.mode === "PHYSICAL" ? "بطاقة فعلية" :
        card.mode === "VIRTUAL" ? "بطاقة افتراضية" :
        card.mode || "---";

    cardExpiry.textContent = card.expiresAt
        ? new Date(card.expiresAt).toLocaleDateString("ar-SA")
        : "لا يوجد تاريخ انتهاء";
}

function showCardMessage(message, type) {
    cardLoginMessage.textContent = message;
    cardLoginMessage.className = "card-login-message";

    if (type) {
        cardLoginMessage.classList.add(type);
    }
}

function addLog(parts) {
    const type = parts[2];
    const passengers = parts[3];
    const balance = parts[4];

    const logNames = {
        "1": "دخول عادي / بيع تذكرة",
        "2": "دخول VIP",
        "3": "إضافة رصيد",
        "4": "دخول مرفوض",
        "5": "تغيير وضع الصيانة",
        "6": "خصم رصيد"
    };

    const now = new Date();

    receivedLogs.unshift({
        name: logNames[type] || "عملية أخرى",
        details: `الركاب: ${passengers} | الرصيد: ${balance} ريال`,
        time: now.toLocaleTimeString("ar-SA")
    });

    receivedLogs = receivedLogs.slice(0, 10);
    renderLogs();

    if (type === "4" && deniedValue) {
        deniedValue.textContent =
            (Number(deniedValue.textContent) || 0) + 1;
    }

    if (type === "3" && rechargeValue) {
        rechargeValue.textContent =
            (Number(rechargeValue.textContent) || 0) + 1;
    }
}

function renderLogs() {
    if (!logsTable) return;

    logsTable.innerHTML = "";

    if (receivedLogs.length === 0) {
        logsTable.innerHTML = `
            <tr>
                <td colspan="3" class="empty-row">
                    لا توجد بيانات بعد
                </td>
            </tr>
        `;
        return;
    }

    receivedLogs.forEach(log => {
        const row = document.createElement("tr");

        const nameCell = document.createElement("td");
        const detailsCell = document.createElement("td");
        const timeCell = document.createElement("td");

        nameCell.textContent = log.name;
        detailsCell.textContent = log.details;
        timeCell.textContent = log.time;

        row.append(nameCell, detailsCell, timeCell);
        logsTable.appendChild(row);
    });
}

function addInvoice(parts) {
    const invoiceNumber = String(parts[2] || "");
    const type = String(parts[3] || "");
    const amount = Number(parts[4]);
    const balance = Number(parts[5]);

    if (!invoiceNumber || processedInvoiceIds.has(invoiceNumber)) {
        return;
    }

    processedInvoiceIds.add(invoiceNumber);

    const now = new Date();

    const invoice = {
        number: invoiceNumber,
        type: type === "2" ? "VIP" :
              type === "1" ? "تذكرة عادية" : "تذكرة",
        amount: Number.isFinite(amount) ? amount : 0,
        balance: Number.isFinite(balance) ? balance : 0,
        date: now.toLocaleDateString("ar-SA"),
        time: now.toLocaleTimeString("ar-SA"),
        status: "مدفوعة"
    };

    receivedInvoices.unshift(invoice);

    renderInvoices();
    updateInvoiceStatistics();
}

function renderInvoices() {
    if (!invoicesTable) return;

    invoicesTable.innerHTML = "";

    if (receivedInvoices.length === 0) {
        invoicesTable.innerHTML = `
            <tr>
                <td colspan="7" class="empty-row">
                    لا توجد فواتير حتى الآن
                </td>
            </tr>
        `;
        return;
    }

    receivedInvoices.forEach(invoice => {
        const row = document.createElement("tr");

        const values = [
            invoice.number,
            invoice.type,
            invoice.amount + " ريال",
            invoice.date,
            invoice.time,
            invoice.status,
            invoice.balance + " ريال"
        ];

        values.forEach(value => {
            const cell = document.createElement("td");
            cell.textContent = value;
            row.appendChild(cell);
        });

        invoicesTable.appendChild(row);
    });
}

function updateInvoiceStatistics() {
    if (invoiceCountValue) {
        invoiceCountValue.textContent =
            receivedInvoices.length.toLocaleString("ar-SA");
    }

    if (revenueValue) {
        const total = receivedInvoices.reduce(
            (sum, invoice) => sum + invoice.amount,
            0
        );

        revenueValue.textContent =
            total.toLocaleString("ar-SA") + " ريال";
    }
}

async function sendArduinoCommand(command) {
    if (!serialPort || !serialPort.writable) {
        controlMessage.textContent = "اتصل بالأردوينو أولاً.";
        return;
    }

    let writer;

    try {
        writer = serialPort.writable.getWriter();

        await writer.write(
            new TextEncoder().encode(command + "\n")
        );

        controlMessage.textContent =
            "تم إرسال الأمر، ننتظر رد الأردوينو...";

    } catch (error) {
        controlMessage.textContent =
            "فشل إرسال الأمر: " + error.message;

    } finally {
        if (writer) writer.releaseLock();
    }
}

function handleAcknowledgement(parts) {
    const command = parts[2] || "";
    const result = parts[3] || "";
    const details = parts[4] || "";

    const messages = {
        GATE_OPEN: "تم قبول أمر فتح البوابة.",
        GATE_CLOSE: "تم قبول أمر إغلاق البوابة.",
        TICKET: "تم تنفيذ أمر التذكرة.",
        BALANCE: "تم تنفيذ عملية الرصيد.",
        MAINTENANCE: "تم تغيير وضع الصيانة."
    };

    controlMessage.textContent = result === "OK"
        ? (messages[command] || details)
        : "تعذر تنفيذ الأمر: " + details;
}

// فتح البوابة
openGateButton?.addEventListener("click", () => {
    if (confirm("هل تريد فتح بوابة المترو؟")) {
        sendArduinoCommand("WEB|GATE|OPEN");
    }
});

// إغلاق البوابة
closeGateButton?.addEventListener("click", () => {
    if (confirm("هل تريد إغلاق بوابة المترو؟")) {
        sendArduinoCommand("WEB|GATE|CLOSE");
    }
});

// بيع تذكرة
sellTicketButton?.addEventListener("click", () => {
    if (confirm("بيع تذكرة بقيمة 5 ريالات؟")) {
        sendArduinoCommand("WEB|TICKET|SELL");
    }
});

// إضافة رصيد
addBalanceButton?.addEventListener("click", () => {
    const amount = prompt("أدخل المبلغ المراد إضافته:");

    if (amount === null) return;

    if (!/^\d+$/.test(amount) ||
        Number(amount) < 1 ||
        Number(amount) > 30000) {
        alert("أدخل مبلغاً صحيحاً من 1 إلى 30000.");
        return;
    }

    if (confirm(`هل تريد إضافة ${amount} ريال؟`)) {
        sendArduinoCommand("WEB|BALANCE|ADD|" + amount);
    }
});

// خصم رصيد
deductBalanceButton?.addEventListener("click", () => {
    const amount = prompt("أدخل المبلغ المراد خصمه:");

    if (amount === null) return;

    if (!/^\d+$/.test(amount) ||
        Number(amount) < 1 ||
        Number(amount) > 30000) {
        alert("أدخل مبلغاً صحيحاً من 1 إلى 30000.");
        return;
    }

    if (confirm(`هل تريد خصم ${amount} ريال؟`)) {
        sendArduinoCommand("WEB|BALANCE|DEDUCT|" + amount);
    }
});

// الصيانة
maintenanceButton?.addEventListener("click", () => {
    const action = maintenanceEnabled ? "OFF" : "ON";

    const message = action === "ON"
        ? "هل تريد تشغيل وضع الصيانة؟"
        : "هل تريد إيقاف وضع الصيانة؟";

    if (confirm(message)) {
        sendArduinoCommand("WEB|MAINTENANCE|" + action);
    }
});

async function disconnectSerial() {
    isReading = false;

    try {
        if (reader) {
            await reader.cancel();
        }

        if (serialPort) {
            await serialPort.close();
        }

    } catch (error) {
        console.error("Disconnect error:", error);
    }

    reader = null;
    serialPort = null;

    if (connectButton) connectButton.disabled = false;
    if (disconnectButton) disconnectButton.disabled = true;

    setControlButtons(false);

    if (systemStatus) systemStatus.textContent = "غير متصل";
    if (serialMessage) {
        serialMessage.textContent = "تم قطع الاتصال بالأردوينو";
    }
    if (dataMessage) {
        dataMessage.textContent =
            "البيانات متوقفة حتى إعادة الاتصال";
    }
    if (controlMessage) {
        controlMessage.textContent =
            "اتصل بالأردوينو لتفعيل أدوات التحكم.";
    }
}

if (disconnectButton) disconnectButton.disabled = true;
setControlButtons(false);
