const mongoose = require("mongoose");

const bookSchema = new mongoose.Schema({
    title: { type: String, required: true },
    author: { type: String, required: true },
    category: { type: String, required: true },
    available: { type: Boolean, default: true },
    pdfPath: { type: String, default: "" },
    thumbnailPath: { type: String, default: "" },
}, { timestamps: true });

const Book = mongoose.model('Book', bookSchema);
module.exports = Book;