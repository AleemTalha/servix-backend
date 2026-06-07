const mongoose = require("mongoose");

const applicationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    applicationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected", "resubmitted"],
      default: "pending",
      index: true,
    },

    applicationType: {
      type: String,
      enum: ["provider"],
      default: "provider",
    },

    providerProfile: {
      categories: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Category",
        },
      ],
      bio: {
        type: String,
        required: true,
        minlength: 20,
      },
      hourlyRate: {
        type: Number,
        required: true,
        min: 0,
      },
      experienceYears: {
        type: Number,
        required: true,
        min: 0,
      },
      location: {
        address: String,
        city: String,
        lat: Number,
        lng: Number,
      },
      cnic: {
        url: String,
        publicId: String,
        detectedNumber: String,
      },
      isAvailable: {
        type: Boolean,
        default: false,
      },
    },

    verificationDocuments: [
      {
        url: String,
        publicId: String,
        type: {
          type: String,
          enum: ["cnic", "document"],
          default: "cnic",
        },
        validationDate: Date,
      },
    ],

    rejectionReason: {
      type: String,
      default: null,
    },

    adminNotes: {
      type: String,
      default: null,
    },

    submittedAt: {
      type: Date,
      default: Date.now,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    resubmissionCount: {
      type: Number,
      default: 0,
    },

    lastResubmittedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

applicationSchema.index({ applicationStatus: 1, createdAt: -1 });

// applicationSchema.index({ userId: 1, applicationStatus: 1 });

applicationSchema.index(
  { userId: 1, applicationStatus: 1 },
  {
    unique: true,
    partialFilterExpression: { applicationStatus: "pending" },
  }
);

module.exports = mongoose.model("Application", applicationSchema);