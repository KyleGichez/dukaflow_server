require("dotenv").config();
const bcrypt = require("bcryptjs");
const db = require("./config/db"); 

const seedAdmin = async () => {
  try {
    console.log("⏳ Initializing local SQLite system administrator build...");

    // Unified credentials from environment or exact defaults
    const email = process.env.SUPERADMIN_EMAIL || "dukaflowadmin@gmail.com";
    const plainPassword = process.env.SUPERADMIN_PASSWORD || "Admin@2026"; 
    const phone = "0793410951"; 
    const businessId = 1; 

    // Clean check targeting the distinct email profile
    const checkAdminSql = `SELECT * FROM users WHERE email = ? LIMIT 1`;

    db.get(checkAdminSql, [email], async (err, existingAdmin) => {
      if (err) {
        console.error("❌ Error checking for existing admin table records:", err.message);
        process.exit(1);
      }

      const hashedPassword = await bcrypt.hash(plainPassword, 10);

      if (existingAdmin) {
        console.log("⚠️ Superadmin exists. Syncing credentials securely...");
        
        // 💡 REMOVED 'status' column to match your actual schema
        const updateAdminSql = `
          UPDATE users 
          SET password = ?, phone = ?, businessId = ? 
          WHERE email = ?
        `;
        db.run(updateAdminSql, [hashedPassword, phone, businessId, email], (updateErr) => {
          if (updateErr) console.error("❌ Failed to update admin record:", updateErr.message);
          console.log("✅ Existing superadmin credentials synchronized perfectly!");
          process.exit(0);
        });
        return;
      }

      // 💡 REMOVED 'status' from the column list and values array here too!
      const insertAdminSql = `
        INSERT INTO users (fname, lname, email, phone, password, city, role, businessId)
        VALUES (?, ?, ?, ?, ?, ?, 'superadmin', ?)
      `;

      db.run(
        insertAdminSql,
        [
          "Gichure",
          "Maina",
          email,
          phone,
          hashedPassword,
          "Nakuru", 
          businessId
        ],
        function (insertErr) {
          if (insertErr) {
            console.error("❌ Failed to register superadmin database row:", insertErr.message);
            process.exit(1);
          }

          console.log("\n==================================================");
          console.log(`✅ Super admin created successfully: Gichure Maina`);
          console.log(`📱 Login Phone Number: ${phone}`);
          console.log(`✉️ Login Email Address: ${email}`);
          console.log("==================================================\n");
          process.exit(0);
        }
      );
    });

  } catch (error) {
    console.error("❌ Critical script execution crash:", error);
    process.exit(1);
  }
};

setTimeout(() => {
  seedAdmin();
}, 500);