const router = require("express").Router();
const User = require("../../models/user.models");
const Application = require("../../models/application.model");
const logger = require("../../utils/logger");

router.get("/", async (req, res) => {
  try {
    const { alertsPage = 1, alertsLimit = 10, alertsType } = req.query;

    const [
      totalUsers,
      customerCount,
      providerCount,
      adminCount,
      pendingApps,
      signupsRaw,
      approvalsRaw,
    ] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ role: "user" }),
      User.countDocuments({ role: "provider" }),
      User.countDocuments({ role: "admin" }),
      Application.countDocuments({ applicationStatus: "pending" }),
      User.aggregate([
        {
          $group: {
            _id: {
              year: { $year: "$createdAt" },
              month: { $month: "$createdAt" },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
        {
          $project: {
            _id: 0,
            month: {
              $concat: [
                { $toString: "$_id.year" },
                "-",
                {
                  $cond: [
                    { $lt: ["$_id.month", 10] },
                    { $concat: ["0", { $toString: "$_id.month" }] },
                    { $toString: "$_id.month" },
                  ],
                },
              ],
            },
            count: 1,
          },
        },
      ]),
      Application.aggregate([
        {
          $group: {
            _id: {
              year: { $year: "$createdAt" },
              month: { $month: "$createdAt" },
            },
            total: { $sum: 1 },
            approved: {
              $sum: { $cond: [{ $eq: ["$applicationStatus", "approved"] }, 1, 0] },
            },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
        {
          $project: {
            _id: 0,
            month: {
              $concat: [
                { $toString: "$_id.year" },
                "-",
                {
                  $cond: [
                    { $lt: ["$_id.month", 10] },
                    { $concat: ["0", { $toString: "$_id.month" }] },
                    { $toString: "$_id.month" },
                  ],
                },
              ],
            },
            total: 1,
            approved: 1,
            rate: {
              $cond: [
                { $gt: ["$total", 0] },
                {
                  $round: [
                    {
                      $multiply: [
                        { $divide: ["$approved", "$total"] },
                        100,
                      ],
                    },
                    1,
                  ],
                },
                0,
              ],
            },
          },
        },
      ]),
    ]);

    const types = alertsType ? alertsType.split(",") : undefined;
    const alertsData = logger.getAlerts({
      page: parseInt(alertsPage),
      limit: parseInt(alertsLimit),
      types,
    });

    return res.status(200).json({
      stats: {
        totalUsers,
        customers: customerCount,
        providers: providerCount,
        admins: adminCount,
        pendingApplications: pendingApps,
      },
      analytics: {
        signups: signupsRaw,
        approvals: approvalsRaw,
      },
      alerts: alertsData.alerts,
      pagination: alertsData.pagination,
    });
  } catch (err) {
    console.error("Dashboard error:", err.message);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

module.exports = router;
