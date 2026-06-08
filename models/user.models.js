const mongoose = require("mongoose");
const { encrypt, decrypt, hashEmail } = require("../utils/encryption");

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true },
    emailHash: { type: String, required: true, unique: true },
    password: { type: String, required: false },
    googleId: { type: String, sparse: true, unique: true },
    facebookId: { type: String, sparse: true, unique: true },
    authProvider: {
      type: String,
      enum: ["local", "google", "facebook"],
      default: "local",
    },
    authMethods: {
      local: { type: Boolean, default: false },
      google: { type: Boolean, default: false },
      facebook: { type: Boolean, default: false },
    },
    emailVerified: { type: Boolean, default: false },
    emailVerifiedAt: { type: Date, default: null },
    profileImage: {
      url: { type: String, default: "/uploads/profile.png" },
      publicId: { type: String },
    },
    notifications: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Notification",
      },
    ],
    contact: { type: String },
    role: {
      type: String,
      enum: ["user", "provider", "admin"],
      default: "user",
    },
    providerProfile: {
      categories: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "serviceCategory",
        },
      ],
      cnic: {
        url: { type: String },
        publicId: { type: String },
      },
      experienceYears: { type: Number },
      bio: { type: String },
      hourlyRate: { type: Number },
      totalRating: { type: Number, default: 0 },
      totalReviews: { type: Number, default: 0 },
      jobsCompleted: { type: Number, default: 0 },
      isAvailable: { type: Boolean, default: true },
      location: {
        address: String,
        city: String,
        lat: Number,
        lng: Number,
      },
      verified: { type: Boolean, default: false },
    },
    fcmToken: { type: [String], default: [] },
    loginHistory: [
      {
        date: { type: Date, default: Date.now },
        ipAddress: { type: String },
        authProvider: { type: String },
      },
    ],
    isBlocked: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },
    verificationDocuments: [
      {
        url: { type: String },
        publicId: { type: String },
        validationDate: { type: Date },
      },
    ],
  },
  { timestamps: true },
);

userSchema.pre("save", async function () {
  if (this.authMethods.local && !this.password) {
    throw new Error("Password is required for local authentication");
  }

  if (this.isModified("firstName")) {
    this.firstName = encrypt(this.firstName);
  }

  if (this.isModified("lastName")) {
    this.lastName = encrypt(this.lastName);
  }

  if (this.isModified("email")) {
    this.emailHash = hashEmail(this.email);
    this.email = encrypt(this.email);
  }
});

userSchema.pre("findOneAndUpdate", function () {
  const update = this.getUpdate();

  if (update.firstName) {
    update.firstName = encrypt(update.firstName);
  }

  if (update.lastName) {
    update.lastName = encrypt(update.lastName);
  }

  if (update.email) {
    update.emailHash = hashEmail(update.email);
    update.email = encrypt(update.email);
  }
});

userSchema.post("save", function (doc) {
  if (doc.firstName) doc.firstName = decrypt(doc.firstName);
  if (doc.lastName) doc.lastName = decrypt(doc.lastName);
  if (doc.email) doc.email = decrypt(doc.email);
});

userSchema.post("find", function (docs) {
  docs.forEach((doc) => {
    if (doc.firstName) doc.firstName = decrypt(doc.firstName);
    if (doc.lastName) doc.lastName = decrypt(doc.lastName);
    if (doc.email) doc.email = decrypt(doc.email);
  });
});

userSchema.post("findOne", function (doc) {
  if (!doc) return;
  if (doc.firstName) doc.firstName = decrypt(doc.firstName);
  if (doc.lastName) doc.lastName = decrypt(doc.lastName);
  if (doc.email) doc.email = decrypt(doc.email);
});

userSchema.post("findOneAndUpdate", function (doc) {
  if (!doc) return;
  if (doc.firstName) doc.firstName = decrypt(doc.firstName);
  if (doc.lastName) doc.lastName = decrypt(doc.lastName);
  if (doc.email) doc.email = decrypt(doc.email);
});

userSchema.methods.decryptedData = function () {
  return {
    firstName: decrypt(this.firstName),
    lastName: decrypt(this.lastName),
    email: decrypt(this.email),
  };
};

userSchema.methods.isGoogleUser = function () {
  return this.authMethods.google;
};

userSchema.methods.isLocalUser = function () {
  return this.authMethods.local;
};

userSchema.methods.isFacebookUser = function () {
  return this.authMethods.facebook;
};

userSchema.methods.canLoginWithEmail = function () {
  return this.authMethods.local;
};

userSchema.methods.canLoginWithGoogle = function () {
  return this.authMethods.google;
};

userSchema.methods.canLoginWithFacebook = function () {
  return this.authMethods.facebook;
};

const User = mongoose.model("User", userSchema);
module.exports = User;