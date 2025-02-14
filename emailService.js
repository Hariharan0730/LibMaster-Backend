const nodemailer = require("nodemailer");
const EmailLog = require("./models/emaillog")
const BorrowRequest = require("./models/borrowrequest");
require("dotenv").config();

const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
    tls: { rejectUnauthorized: false },
});

const sendEmail = async (to, subject, text) => {
    try {
        await transporter.sendMail({ from: process.env.EMAIL_USER, to, subject, text });

        await EmailLog.create({ to, subject, text });

    } catch (error) {
        console.error(`Failed to send email to ${to}:`, error);
    }
};

const sendOverdueEmails = async () => {
    try {
        const today = new Date();
        let overdueNotifiedUsers = [];

        const overdueRequests = await BorrowRequest.find({
            dueDate: { $lt: today },
            returned: false,
        }).populate("user").populate("book");

        if (overdueRequests.length === 0) {
            await sendEmail(process.env.ADMIN_EMAIL, "LibMaster - No Overdue Books", "No overdue books today.");
            return;
        }

        for (const request of overdueRequests) {
            if (!request.user.email) continue;

            const emailText = `Dear ${request.user.name},\n\nYour book "${request.book.title}" was due on ${request.dueDate.toDateString()}. Please return it ASAP.\n\nLibMaster Team.`;

            await sendEmail(request.user.email, "Overdue Book Notice - LibMaster", emailText);
            overdueNotifiedUsers.push(`${request.user.name} (${request.user.email})`);
        }

        if (overdueNotifiedUsers.length > 0) {
            await sendEmail(
                process.env.ADMIN_EMAIL,
                "Overdue Book Notifications Sent",
                `Notified students:\n\n${overdueNotifiedUsers.join("\n")}`
            );
        }
    } catch (error) {
        console.error("Error sending overdue emails:", error);
    }
};

const sendAdminSummary = async () => {
    try {
        const adminEmail = process.env.ADMIN_EMAIL;
        if (!adminEmail) return console.error("No Admin Email Configured!");

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const emailLogs = await EmailLog.find({ date: { $gte: today } });

        if (emailLogs.length === 0) {
            await sendEmail(adminEmail, "LibMaster Daily Summary", "No emails were sent today.");
            return;
        }

        const emailSummary = emailLogs.map(entry =>
            `Email Sent!
        ---------------------------------------
        To: ${entry.to}  
        Subject: ${entry.subject}  
        Sent On: ${entry.date.toLocaleString()}  
        
        Message:  
        ${entry.text}  
        ---------------------------------------
        
        Status: Successfully Sent!`
        ).join("\n\n");


        await sendEmail(adminEmail, "LibMaster Daily Summary", `Email Report:\n\n${emailSummary}`);
    } catch (error) {
        console.error("Error sending admin summary:", error);
    }
};

module.exports = { sendEmail, sendOverdueEmails, sendAdminSummary };
