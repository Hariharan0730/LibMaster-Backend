const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["student", "staff"], required: true },
  borrowedBooks: [{  
    book: { type: mongoose.Schema.Types.ObjectId, ref: "Book" },
    returnDate: { type: Date },
  }],
  booksRead: { type: Number, default: 0 },
  bookmarks: [{ type: mongoose.Schema.Types.ObjectId, ref: "Book" }], 
}, { timestamps: true });

const User = mongoose.model("User", UserSchema);
module.exports = User;