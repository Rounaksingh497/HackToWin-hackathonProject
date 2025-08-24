// server.js
// Corrected and cleaned for the Hacktowin platform.

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
require("dotenv").config();

// --- Basic Setup ---
const app = express();
const PORT = process.env.PORT || 5001; // Running on port 5001

// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- Configuration ---
const JWT_SECRET = process.env.JWT_SECRET; // Use a strong, unique secret key

// --- Database Connection (MongoDB) ---
const dbURI = process.env.MONGODB_URI;

mongoose.connect(dbURI)
    .then(() => console.log('✅ Successfully connected to the Hacktowin database!'))
    .catch((err) => {
        console.error('--- ❌ MONGODB CONNECTION ERROR ---');
        console.error("Could not connect to the database. Please check your connection string and network access.");
        console.error("\nOriginal Error:", err.message);
        console.error('------------------------------------');
});

// --- Database Schema & Model for Hacktowin Users ---

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true
    },
    userType: {
        type: String,
        required: true,
        enum: ['participant', 'organizer', 'judge'] // Defines the allowed roles
    },
    registeredAt: {
        type: Date,
        default: Date.now
    }
});

const User = mongoose.model('User', userSchema);


// --- API Endpoints ---

// Endpoint for User Registration
app.post('/api/auth/register', async (req, res) => {
    // Destructure all required fields from the form submission
    const { name, email, password, role } = req.body;

    // Validate that all fields were sent
    if (!name || !email || !password || !role) {
        return res.status(400).json({ msg: 'Please enter all fields.' });
    }

    try {
        // Check if a user with that email already exists
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ msg: 'User with this email already exists.' });
        }

        // Create a new user instance with the form data
        user = new User({
            name,
            email,
            password,
            userType: role // Map the incoming 'role' to the 'userType' field
        });

        // Hash the password before saving to the database
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);

        // Save the new user to the database
        await user.save();

        res.status(201).json({ msg: 'Account created successfully! Please log in.' });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error during registration.');
    }
});

// Endpoint for User Login
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ msg: 'Please enter all fields.' });
    }

    try {
        // Find the user by email
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ msg: 'Invalid credentials.' });
        }

        // Compare the submitted password with the hashed password in the database
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ msg: 'Invalid credentials.' });
        }

        // Create JWT payload with user info
        const payload = {
            user: {
                id: user.id,
                name: user.name,
                role: user.userType
            }
        };

        // Sign the token and send it back to the client
        jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' }, (err, token) => {
            if (err) throw err;
            res.json({ token, msg: 'Logged in successfully!' });
        });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error during login.');
    }
});

// --- Serve Frontend (HTML/CSS/JS) ---
// Assuming your frontend is in "client" folder at project root
app.use(express.static(path.join(__dirname, '../client')));

// Fallback for SPA routes (Express 5 fix: use regex instead of '*')
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../client/index.html"));
});

app.get("/payment", (req, res) => {
    res.sendFile(path.join(__dirname, "../client/payment.html"));
});

app.use('/style', express.static(path.join(__dirname, '../style')));

// --- Start The Server ---
app.listen(PORT, () => {
    console.log(`🚀 Hacktowin backend server is live and running on http://localhost:${PORT}`);
});