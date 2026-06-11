const router = require("express").Router();
const protect = require("../../middlewares/protect");
const User = require("../../models/user.models");
const Category = require("../../models/category.models");
const Booking = require("../../models/booking.models");
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

// ✨ POST Create Booking (Customer)
router.post("/", protect, async (req, res) => {
  try {
    const { providerId, categoryId, scheduledDate, address, notes } = req.body;

    // 1. Validation
    if (!providerId || !categoryId || !scheduledDate || !address) {
      return res.status(400).json({
        success: false,
        message: "providerId, categoryId, scheduledDate, and address are required.",
      });
    }

    // 2. Fetch Provider & Validate Verified Status
    const provider = await User.findById(providerId);
    if (!provider) {
      return res.status(404).json({
        success: false,
        message: "Provider not found.",
      });
    }

    if (provider.role !== "provider" || !provider.providerProfile?.verified) {
      return res.status(400).json({
        success: false,
        message: "Selected provider is not verified or not registered as a provider.",
      });
    }

    // 3. Fetch Category
    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found.",
      });
    }

    // 4. Calculate Price (Fetch provider's hourly rate)
    const price = provider.providerProfile.hourlyRate;
    if (price === undefined || price === null) {
      return res.status(400).json({
        success: false,
        message: "Provider does not have an hourly rate set in their profile.",
      });
    }

    // 5. Save Booking
    const booking = new Booking({
      customer: req.user.id,
      provider: providerId,
      category: categoryId,
      scheduledDate,
      address,
      notes,
      price,
      status: "pending",
    });

    await booking.save();

    // 6. Create database notification for the provider
    const customerName = req.user.name || "A Customer";
    const categoryName = category.name || "Service";
    
    const notificationTitle = "New Booking Request 📅";
    const notificationBody = `${customerName} has requested a booking for ${categoryName}.`;

    await Notification.create({
      title: notificationTitle,
      description: notificationBody,
      recipient: providerId,
    });

    // 7. Send push notification via FCM
    if (provider.fcmToken && provider.fcmToken.length > 0) {
      const invalidTokens = await sendNotification(
        provider.fcmToken,
        notificationTitle,
        notificationBody
      );
      await removeInvalidTokens(provider._id, invalidTokens);
    }

    // 8. Return response
    return res.status(201).json({
      success: true,
      message: "Booking created successfully",
      booking: {
        _id: booking._id,
        customer: booking.customer,
        provider: booking.provider,
        category: booking.category,
        scheduledDate: booking.scheduledDate,
        status: booking.status,
        address: booking.address,
        notes: booking.notes,
        price: booking.price,
        createdAt: booking.createdAt,
        updatedAt: booking.updatedAt,
      },
    });
  } catch (err) {
    console.error("Error creating booking:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// ✨ GET Customer Bookings (Customer)
router.get("/", protect, async (req, res) => {
  try {
    const bookings = await Booking.find({ customer: req.user.id })
      .populate("provider", "firstName lastName email")
      .populate("category", "name")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      bookings,
    });
  } catch (err) {
    console.error("Error fetching customer bookings:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// ✨ PATCH Update Booking Status (Customer/Provider)
router.patch("/:id/status", protect, async (req, res) => {
  try {
    const { status } = req.body;
    const bookingId = req.params.id;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required.",
      });
    }

    const validStatuses = ["pending", "accepted", "rejected", "declined", "completed", "cancelled"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found.",
      });
    }

    // Check authorization: User must be customer or provider of this booking
    const isCustomer = booking.customer.toString() === req.user.id;
    const isProvider = booking.provider.toString() === req.user.id;

    if (!isCustomer && !isProvider) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You are not authorized to update this booking.",
      });
    }

    // Update status
    booking.status = status;
    await booking.save();

    // Trigger Notification to opposite party
    const recipientId = isCustomer ? booking.provider : booking.customer;
    const senderName = req.user.name || "User";
    const notificationTitle = `Booking Status Update 📅`;
    const notificationBody = `Your booking status has been updated to "${status}" by ${senderName}.`;

    // Save DB notification
    await Notification.create({
      title: notificationTitle,
      description: notificationBody,
      recipient: recipientId,
    });

    // Send Push Notification
    const recipientUser = await User.findById(recipientId);
    if (recipientUser && recipientUser.fcmToken && recipientUser.fcmToken.length > 0) {
      const invalidTokens = await sendNotification(
        recipientUser.fcmToken,
        notificationTitle,
        notificationBody
      );
      await removeInvalidTokens(recipientUser._id, invalidTokens);
    }

    return res.status(200).json({
      success: true,
      message: "Booking status updated successfully",
      booking: {
        _id: booking._id,
        status: booking.status,
        updatedAt: booking.updatedAt,
      },
    });
  } catch (err) {
    console.error("Error updating booking status:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

module.exports = router;
