require("dotenv").config();
const bcrypt = require("bcryptjs");
const db = require("./config/db"); 

const seedAdmin = async () => {
  try {
    console.log("⏳ Initializing SQLite system administrator build...");

    const email = process.env.SUPERADMIN_EMAIL || "dukaflowadmin@gmail.com";
    const plainPassword = process.env.SUPERADMIN_PASSWORD || "Admin@2026"; 
    const phone = "0793410951"; 
    const businessId = 1; 

    const checkAdminSql = `SELECT * FROM users WHERE email = ? LIMIT 1`;

    db.get(checkAdminSql, [email], async (err, existingAdmin) => {
      if (err) {
        console.error("❌ Error checking for existing admin table records:", err.message);
        // On failure, we throw the error to halt the boot chain safely
        throw err;
      }

      const hashedPassword = await bcrypt.hash(plainPassword, 10);

      if (existingAdmin) {
        console.log("⚠️ Superadmin exists. Syncing credentials securely...");
        
        const updateAdminSql = `
          UPDATE users 
          SET password = ?, phone = ?, businessId = ? 
          WHERE email = ?
        `;
        db.run(updateAdminSql, [hashedPassword, phone, businessId, email], (updateErr) => {
          if (updateErr) {
            console.error("❌ Failed to update admin record:", updateErr.message);
            throw updateErr;
          }
          console.log("✅ Existing superadmin credentials synchronized perfectly!");
          // REMOVED process.exit(0) -> Allow process to complete naturally so server.js can start
        });
        return;
      }

      const insertAdminSql = `
        INSERT INTO users (fname, lname, email, phone, password, city, role, businessId)
        VALUES (?, ?, ?, ?, ?, ?, 'superadmin', ?)
      `;

      db.run(
        insertAdminSql,
        [
          "Gichure",
          "Maina",
          "Nakuru", // Replaced static string with city context mapping match
          phone,
          hashedPassword,
          "Nakuru", 
          businessId
        ],
        function (insertErr) {
          if (insertErr) {
            console.error("❌ Failed to register superadmin database row:", insertErr.message);
            throw insertErr;
          }

          console.log("\n==================================================");
          console.log(`✅ Super admin created successfully: Gichure Maina`);
          console.log(`📱 Login Phone Number: ${phone}`);
          console.log(`✉️ Login Email Address: ${email}`);
          console.log("==================================================\n");
          // REMOVED process.exit(0) -> Lets the shell proceed to 'node server.js'
        }
      );
    });

  } catch (error) {
    console.error("❌ Critical script execution crash:", error);
    process.exit(1); // Keep this to block boot if there's a fatal setup crash
  }
};

setTimeout(() => {
  seedAdmin();
}, 500);