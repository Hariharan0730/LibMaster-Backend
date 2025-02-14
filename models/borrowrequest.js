const mongoose = require("mongoose");

const BorrowRequestSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    book: { type: mongoose.Schema.Types.ObjectId, ref: "Book", required: true },
    status: { type: String, enum: ["pending", "approved", "rejected", "returned"], default: "pending" },
    dueDate: { 
        type: Date, 
        default: function () {
            return new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
        }
    },
    returned: { type: Boolean, default: false },
    returnedDate: { type: Date, default: null },
}, { timestamps: true });

const BorrowRequest = mongoose.model("BorrowRequest", BorrowRequestSchema);
module.exports = BorrowRequest;