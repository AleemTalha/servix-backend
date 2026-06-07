const admin = require("firebase-admin");

const logVerificationEvent = async (userId, email, authProvider, success) => {
  try {
    const db = admin.firestore();
    const timestamp = new Date().toISOString();
    
    await db.collection("verification_logs").add({
      userId: userId || null,
      email: email,
      authProvider: authProvider,
      success: success,
      timestamp: timestamp,
      status: success ? "verified" : "failed",
    });

    return { success: true };
  } catch (error) {
    console.error("Error logging verification event to Firebase:", error);
    return { success: false, error: error.message };
  }
};

const logAuthEvent = async (userId, email, eventType, authProvider, metadata = {}) => {
  try {
    const db = admin.firestore();
    const timestamp = new Date().toISOString();

    await db.collection("auth_logs").add({
      userId: userId || null,
      email: email,
      eventType: eventType,
      authProvider: authProvider,
      timestamp: timestamp,
      metadata: metadata,
    });

    return { success: true };
  } catch (error) {
    console.error("Error logging auth event to Firebase:", error);
    return { success: false, error: error.message };
  }
};

const sendVerificationNotification = async (userId, email, userName) => {
  try {
    const db = admin.firestore();
    
    await db.collection("notifications").add({
      userId: userId,
      email: email,
      type: "email_verified",
      title: "Email Verified",
      message: `Welcome to Servix, ${userName}! Your email has been verified.`,
      read: false,
      createdAt: new Date().toISOString(),
    });

    return { success: true };
  } catch (error) {
    console.error("Error sending verification notification:", error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  logVerificationEvent,
  logAuthEvent,
  sendVerificationNotification,
};
