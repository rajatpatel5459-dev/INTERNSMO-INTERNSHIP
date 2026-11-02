// controllers/authController.js - Register & Login

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');

const ACCESS_TOKEN_SECONDS = 60 * 60;
const REFRESH_TOKEN_SECONDS = 30 * 24 * 60 * 60;
const REFRESH_COOKIE = 'ai_dj_refresh';

function parseLifetime(value, fallbackSeconds) {
  const match = /^(\d+)(s|m|h|d)?$/i.exec(String(value || ''));
  if (!match) return fallbackSeconds;
  const amount = Number(match[1]);
  const unit = (match[2] || 's').toLowerCase();
  const multiplier = { s: 1, m: 60, h: 3600, d: 86400 }[unit];
  return amount > 0 ? amount * multiplier : fallbackSeconds;
}

function refreshSecret() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required to sign authentication tokens.');
  return crypto.createHmac('sha256', process.env.JWT_SECRET).update('ai-dj-refresh-token-v1').digest('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function cookieValue(req, name) {
  const cookie = (req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return cookie ? cookie.slice(name.length + 1) : null;
}

function refreshCookieOptions(maxAge) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/api/auth',
    maxAge,
  };
}

function accessTokenSeconds() {
  return Math.min(parseLifetime(process.env.JWT_EXPIRE, ACCESS_TOKEN_SECONDS), ACCESS_TOKEN_SECONDS);
}

function createToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: accessTokenSeconds(),
  });
}

async function issueTokens(user, res) {
  const refreshSeconds = Math.min(parseLifetime(process.env.JWT_REFRESH_EXPIRE, REFRESH_TOKEN_SECONDS), 90 * 24 * 60 * 60);
  const refreshToken = jwt.sign(
    { id: user._id, tokenType: 'refresh' },
    refreshSecret(),
    { expiresIn: refreshSeconds }
  );
  user.refreshTokenHash = hashToken(refreshToken);
  await user.save({ validateBeforeSave: false });
  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions(refreshSeconds * 1000));
  return { token: createToken(user._id), expiresIn: accessTokenSeconds() };
}

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
const register = async (req, res, next) => {
  try {
    const { displayName, email, password } = req.body;

    if (!displayName || !email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide name, email, and password.' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email is already registered.' });
    }

    // Create user (password is hashed in the model pre-save hook)
    const user = await User.create({
      displayName,
      email,
      passwordHash: password, // pre-save hook will hash this
    });

    const tokens = await issueTokens(user, res);

    res.status(201).json({
      success: true,
      message: 'Registration successful!',
      ...tokens,
      user: {
        id: user._id,
        displayName: user.displayName,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @route   POST /api/auth/login
// @desc    Login a user
// @access  Public
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide email and password.' });
    }

    // Find user and include password for comparison
    const user = await User.findOne({ email }).select('+passwordHash +refreshTokenHash');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    // Check if password matches
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const tokens = await issueTokens(user, res);

    res.status(200).json({
      success: true,
      message: 'Login successful!',
      ...tokens,
      user: {
        id: user._id,
        displayName: user.displayName,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    next(error);
  }
};

const refresh = async (req, res, next) => {
  try {
    const token = cookieValue(req, REFRESH_COOKIE);
    if (!token) return res.status(401).json({ success: false, message: 'Refresh session is missing. Please sign in again.' });

    let decoded;
    try {
      decoded = jwt.verify(token, refreshSecret());
    } catch {
      res.clearCookie(REFRESH_COOKIE, refreshCookieOptions(0));
      return res.status(401).json({ success: false, message: 'Refresh session has expired. Please sign in again.' });
    }

    if (decoded.tokenType !== 'refresh') {
      res.clearCookie(REFRESH_COOKIE, refreshCookieOptions(0));
      return res.status(401).json({ success: false, message: 'Invalid refresh session. Please sign in again.' });
    }

    const user = await User.findById(decoded.id).select('+refreshTokenHash');
    const storedHash = user?.refreshTokenHash;
    const receivedHash = hashToken(token);
    const matches = storedHash
      && storedHash.length === receivedHash.length
      && crypto.timingSafeEqual(Buffer.from(storedHash), Buffer.from(receivedHash));
    if (!user || !matches) {
      res.clearCookie(REFRESH_COOKIE, refreshCookieOptions(0));
      return res.status(401).json({ success: false, message: 'Refresh session is no longer valid. Please sign in again.' });
    }

    const tokens = await issueTokens(user, res);
    res.status(200).json({
      success: true,
      ...tokens,
      user: {
        id: user._id,
        displayName: user.displayName,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    const token = cookieValue(req, REFRESH_COOKIE);
    if (token) {
      try {
        const decoded = jwt.verify(token, refreshSecret());
        await User.findByIdAndUpdate(decoded.id, { $unset: { refreshTokenHash: 1 } });
      } catch (error) {
        if (!(error instanceof jwt.JsonWebTokenError) && !(error instanceof jwt.TokenExpiredError)) throw error;
      }
    }
    res.clearCookie(REFRESH_COOKIE, refreshCookieOptions(0));
    res.status(200).json({ success: true, message: 'Logged out.' });
  } catch (error) {
    next(error);
  }
};

// @route   GET /api/auth/me
// @desc    Get the currently logged-in user's profile
// @access  Private
const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        displayName: user.displayName,
        email: user.email,
        role: user.role,
        preferences: user.preferences,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @route   PUT /api/auth/me
// @desc    Update user profile (name, preferences)
// @access  Private
const updateProfile = async (req, res, next) => {
  try {
    const { displayName, preferences } = req.body;
    const updateData = {};
    if (displayName) updateData.displayName = displayName;
    if (preferences) updateData.preferences = preferences;

    const user = await User.findByIdAndUpdate(req.user.id, updateData, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      success: true,
      message: 'Profile updated!',
      user: {
        id: user._id,
        displayName: user.displayName,
        email: user.email,
        role: user.role,
        preferences: user.preferences,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { register, login, refresh, logout, getMe, updateProfile };
