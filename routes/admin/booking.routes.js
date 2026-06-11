const router = require("express").Router();
const Booking = require("../../models/booking.models");
const User = require("../../models/user.models");
const Notification = require("../../models/notification.models");
const firebaseAdmin = require("../../config/firebase");

// Helper: Send FCM Push Notification
const sendNotification = async (tokens, title, body) => {
  if (!tokens?.length) return [];
  try {
    const res = await firebaseAdmin.messaging().sendEachForMulticast({
      notification: { title, body },
      tokens,
    });
    return res.responses
      .map((r, i) =>
        !r.success &&
        [
          "messaging/invalid-registration-token",
          "messaging/registration-token-not-registered",
        ].includes(r.error?.code)
          ? tokens[i]
          : null,
      )
      .filter(Boolean);
  } catch (err) {
    console.error("sendNotification error:", err.message);
    return [];
  }
};

// Helper: Clean up invalid FCM tokens
const removeInvalidTokens = async (userId, tokens) => {
  if (tokens.length > 0) {
    await User.findByIdAndUpdate(userId, {
      $pull: { fcmToken: { $in: tokens } },
    });
  }
};

// Helper: Send notifications to both Customer and Provider
const notifyParties = async (customerUserId, providerUserId, title, body) => {
  try {
    // Create DB notifications
    await Promise.all([
      Notification.create({ title, description: body, recipient: customerUserId }),
      Notification.create({ title, description: body, recipient: providerUserId }),
    ]);

    // Send Push notifications
    const users = await User.find({ _id: { $in: [customerUserId, providerUserId] } }).select("fcmToken");
    for (const u of users) {
      if (u.fcmToken && u.fcmToken.length > 0) {
        const invalid = await sendNotification(u.fcmToken, title, body);
        await removeInvalidTokens(u._id, invalid);
      }
    }
  } catch (err) {
    console.error("notifyParties error:", err);
  }
};

// ✨ GET /api/admin/bookings (List All Bookings - Paginated)
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const bookings = await Booking.find()
      .populate("customer", "firstName lastName")
      .populate("provider", "firstName lastName")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Booking.countDocuments();
    const totalPages = Math.ceil(total / limit);

    return res.status(200).json({
      success: true,
      bookings,
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
    });
  } catch (err) {
    console.error("Admin error fetching bookings:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// ✨ PUT /api/admin/bookings/:id (Update Booking details)
router.put("/:id", async (req, res) => {
  try {
    const { scheduledDate, providerId, price } = req.body;
    const bookingId = req.params.id;

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found.",
      });
    }

    let providerChanged = false;
    let originalProviderId = booking.provider;

    // Validate and update Provider if provided
    if (providerId && providerId !== booking.provider.toString()) {
      const newProvider = await User.findById(providerId);
      if (!newProvider) {
        return res.status(404).json({
          success: false,
          message: "New provider not found.",
        });
      }
      if (newProvider.role !== "provider" || !newProvider.providerProfile?.verified) {
        return res.status(400).json({
          success: false,
          message: "Selected user is not a verified provider.",
        });
      }
      booking.provider = providerId;
      providerChanged = true;

      // Update price dynamically to new provider's hourly rate if custom price not specified
      if (price === undefined) {
        booking.price = newProvider.providerProfile.hourlyRate;
      }
    }

    if (scheduledDate) {
      booking.scheduledDate = scheduledDate;
    }

    if (price !== undefined) {
      booking.price = price;
    }

    await booking.save();

    // Notify original parties and new provider if changed
    const title = "Booking Updated by Admin 🛠️";
    const body = `Your booking scheduled details have been updated by the administrator.`;
    
    // Notify customer and provider
    await notifyParties(booking.customer, booking.provider, title, body);
    
    // If provider was changed, notify the old provider too
    if (providerChanged) {
      await Notification.create({
        title,
        description: "You have been unassigned from a booking by the administrator.",
        recipient: originalProviderId,
      });
      const oldProvider = await User.findById(originalProviderId).select("fcmToken");
      if (oldProvider && oldProvider.fcmToken?.length) {
        const invalid = await sendNotification(oldProvider.fcmToken, title, "You have been unassigned from a booking.");
        await removeInvalidTokens(oldProvider._id, invalid);
      }
    }

    return res.status(200).json({
      success: true,
      message: "Booking updated by admin",
      booking: {
        _id: booking._id,
        scheduledDate: booking.scheduledDate,
        price: booking.price,
      },
    });
  } catch (err) {
    console.error("Admin error updating booking:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// ✨ DELETE /api/admin/bookings/:id (Delete Booking)
router.delete("/:id", async (req, res) => {
  try {
    const bookingId = req.params.id;
    const booking = await Booking.findById(bookingId);
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found.",
      });
    }

    await Booking.findByIdAndDelete(bookingId);

    // Notify parties about cancellation/deletion
    const title = "Booking Cancelled/Deleted by Admin ❌";
    const body = `Your scheduled booking has been cancelled/deleted by the administrator.`;
    await notifyParties(booking.customer, booking.provider, title, body);

    return res.status(200).json({
      success: true,
      message: "Booking deleted successfully",
    });
  } catch (err) {
    console.error("Admin error deleting booking:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

module.exports = router;
