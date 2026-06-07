const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Category = require("../models/category.models");

const seedCategories = async () => {
  try {
    const categoriesToSeed = [
      {
        name: "Cleaner",
        description:
          "Professional residential and commercial space cleaning services.",
        filename: "cleaner.png",
      },
      {
        name: "Dry Cleaning",
        description: "Professional garment cleaning and fabric care services.",
        filename: "dryClean.png",
      },
      {
        name: "Electrician",
        description:
          "Professional at-home electrical services for all your installation, repair, and maintenance needs. From fixing faulty wiring, short circuits, and broken switches to installing ceiling fans, decorative lighting, and smart home appliances, our certified electricians ensure complete safety and precision. Reliable technical help is just a tap away to keep your home safely powered.",
        filename: "electric.png",
      },
      {
        name: "Gardener",
        description: "Lawn care, landscaping, and garden maintenance services.",
        filename: "gardner.png",
      },
      {
        name: "Mechanic",
        description:
          "Automotive diagnostic, maintenance, and mechanical repair work.",
        filename: "mehcanic.png",
      },
    ];

    console.log("Starting category database seeding...");
    await connectDB();

    for (const item of categoriesToSeed) {
      const existingCategory = await Category.findOne({ name: item.name });

      if (!existingCategory) {
        const timestamp = Date.now();
        const randomInt = Math.floor(100000000 + Math.random() * 900000000);
        const generatedPublicId = `image-${timestamp}-${randomInt}.png`;

        const newCategory = new Category({
          name: item.name,
          description: item.description,
          image: {
            url: `/uploads/${item.filename}`,
            publicId: generatedPublicId,
          },
          isActive: true,
          isDeleted: false,
          providerCount: 0,
        });

        await newCategory.save();
        console.log(`Successfully seeded category: [${item.name}]`);
      } else {
        console.log(`Category [${item.name}] already exists. Skipping.`);
      }
    }

    console.log("Category seeding process completed successfully.");
  } catch (err) {
    console.error("Error during category database seeding:", err);
    throw err;
  }
};

seedCategories()
  .then(() => {
    console.log("Seeding finished. Closing database connection.");
    mongoose.connection.close();
  })
  .catch((err) => {
    console.error("Seeding failed with error:", err);
    mongoose.connection.close();
  });
