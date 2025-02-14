const express = require("express");
const multer = require("multer");
const path = require("path");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const BorrowRequest = require('../models/borrowrequest');
const Book = require("../models/book");
const User = require("../models/user");
const { sendEmail, sendOverdueEmails, sendAdminSummary } = require("../emailService");
require("dotenv").config();
const router = express.Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: "ebooks",
    resource_type: "auto",
    format: "pdf",
    public_id: `${Date.now()}-${path.parse(file.originalname).name}`,
  }),
});

const upload = multer({ storage });

router.post("/upload", upload.single("pdf"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: " No file uploaded" });
    }

    const { title, author, category } = req.body;
    if (!title || !author || !category) {
      return res.status(400).json({ message: " All fields are required" });
    }

    const pdfUrl = req.file.path;
    const pdfPublicId = req.file.filename;

    await new Promise(resolve => setTimeout(resolve, 8000));

    let thumbnailPath;
    try {
      const cloudinaryResponse = await cloudinary.uploader.explicit(pdfPublicId, {
        type: "upload",
        resource_type: "image",
        pages: "1",
        format: "jpg",
        transformation: [{ width: 200, aspect_ratio: "4:5", crop: "fill", gravity: "auto" }],
      });

      if (cloudinaryResponse.secure_url) {
        thumbnailPath = pdfUrl.replace("/upload/", "/upload/pg_1,w_200,h_250,c_fit/").replace(".pdf", ".jpg");
      } else {
        throw new Error("No valid thumbnail returned");
      }
    } catch (thumbnailError) {
      console.error(" Thumbnail Generation Error:", thumbnailError.message);
      thumbnailPath = "https://your-own-default-thumbnail.com/fallback.jpg";
    }

    const newBook = new Book({
      title,
      author,
      category,
      available: true,
      pdfPath: pdfUrl,
      thumbnailPath,
    });

    await newBook.save();

    res.status(200).json({ message: "Book uploaded successfully!", book: newBook });

  } catch (err) {
    console.error("Upload Error:", err);
    res.status(500).json({ message: "Failed to upload book", error: err.message });
  }
});

router.get("/books", async (req, res) => {
  try {
    const books = await Book.find();
    res.json(books);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch books", error: err.message });
  }
});

router.post("/borrow/:bookId", async (req, res) => {
  try {
    const { userId } = req.body;
    const { bookId } = req.params;

    const book = await Book.findById(bookId);
    if (!book || !book.available) return res.status(400).json({ message: "Book is not available" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const newRequest = new BorrowRequest({ book: bookId, user: userId, status: "pending" });
    await newRequest.save();

    res.status(200).json({ message: "Borrow request submitted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Error processing borrow request", error: err.message });
  }
});
 
router.post("/approveRequest/:requestId", async (req, res) => {
  try {
    const { requestId } = req.params;

    const request = await BorrowRequest.findById(requestId).populate("book").populate("user");
    if (!request) return res.status(404).json({ message: "Request not found" });

    request.status = "approved";
    request.dueDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    const book = await Book.findById(request.book);
    if (book) {
      book.available = false;
      await book.save();
    }

    await request.save();
 
    await sendEmail(
      request.user.email,
      "Borrow Request Approved",
      `Dear ${request.user.name},\n\nYour borrow request for "${request.book.title}" has been approved. Your due date is ${request.dueDate.toDateString()}.`
    );

    res.status(200).json({ message: "Borrow request approved and email sent!" });
  } catch (err) {
    res.status(500).json({ message: "Error processing approval", error: err.message });
  }
});
 
router.post("/approveReturn/:requestId", async (req, res) => {
  try {
    const { requestId } = req.params;

    const request = await BorrowRequest.findById(requestId).populate("book").populate("user");
    if (!request) {
      return res.status(404).json({ message: "Return request not found" });
    }

    if (request.status !== "approved") {
      return res.status(400).json({ message: "This book has not been approved for return." });
    }

    request.status = "returned";
    request.returned = true;
    request.returnedDate = new Date();

    const book = await Book.findById(request.book);
    if (book) {
      book.available = true;
      await book.save();
    } else {
      console.error(" Book not found in database.");
    }

    await request.save();

    const updatedUser = await User.findByIdAndUpdate(
      request.user._id,
      { $inc: { booksRead: 1 } },
      { new: true }
    );

    if (updatedUser) {
      console.log(`Updated booksRead count for ${updatedUser.name}: ${updatedUser.booksRead}`);
    } else {
      console.error("Failed to update booksRead count.");
    }

    await sendEmail(
      request.user.email,
      "Book Returned Successfully",
      `Dear ${request.user.name},\n\nYou have successfully returned "${request.book.title}". Thank you!\n\n- Library Team`
    );

    res.status(200).json({
      message: "Return request approved, book marked as available, and email sent!",
      booksRead: updatedUser ? updatedUser.booksRead : 0
    });

  } catch (err) {
    res.status(500).json({ message: "Error processing return approval", error: err.message });
  }

});

router.get("/borrowRequests", async (req, res) => {
  try {
    const borrowRequests = await BorrowRequest.find({ status: "pending" }).populate("book").populate("user");
    res.json(borrowRequests);
  } catch (err) {
    res.status(500).json({ message: "Error fetching borrow requests", error: err.message });
  }
});

router.get("/overdue/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const today = new Date();

    const overdueBooks = await BorrowRequest.find({
      user: userId,
      dueDate: { $lt: today },
      returned: false,
    }).populate("book");

    if (overdueBooks.length === 0) {
      return res.json({ message: "No overdue books!" });
    }

    res.json(overdueBooks);
  } catch (err) {
    res.status(500).json({ message: "Error fetching overdue books", error: err.message });
  }
});

router.get("/borrowed/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const borrowedBooks = await BorrowRequest.find({
      user: userId,
      status: "approved",
      returned: false
    }).populate("book");

    res.json(borrowedBooks);
  } catch (err) {
    res.status(500).json({ message: "Error fetching borrowed books", error: err.message });
  }
});

router.post("/bookmark/:bookId", async (req, res) => {
  try {
    const { userId } = req.body;
    const { bookId } = req.params;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.bookmarks.includes(bookId)) {
      return res.status(400).json({ message: "Book already bookmarked" });
    }

    user.bookmarks.push(bookId);
    await user.save();

    res.status(200).json({ message: "Book bookmarked successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Error bookmarking book", error: err.message });
  }
});

router.delete("/bookmark/:bookId", async (req, res) => {
  try {
    const { userId } = req.body;
    const { bookId } = req.params;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.bookmarks = user.bookmarks.filter(id => id.toString() !== bookId);
    await user.save();

    res.status(200).json({ message: "Bookmark removed successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Error removing bookmark", error: err.message });
  }
});

router.get("/bookmarks/:userId", async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).populate("bookmarks");
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json(user.bookmarks);
  } catch (err) {
    res.status(500).json({ message: "Error fetching bookmarks", error: err.message });
  }
});

router.get("/test/sendOverdueEmails", async (req, res) => {
  try {
    await sendOverdueEmails();
    res.json({ message: "📧 Overdue emails sent successfully!" });
  } catch (error) {
    res.status(500).json({ message: "❌ Error sending overdue emails", error: error.message });
  }
});

router.get("/test/sendAdminSummary", async (req, res) => {
  try {
    await sendAdminSummary();
    res.json({ message: "📧 Admin summary email sent successfully!" });
  } catch (error) {
    res.status(500).json({ message: "❌ Error sending admin summary", error: error.message });
  }
});

module.exports = router;