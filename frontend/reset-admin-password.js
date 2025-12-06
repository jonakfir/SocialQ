// Script to reset password for jonakfir@gmail.com
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function resetAdminPassword() {
  try {
    const email = 'jonakfir@gmail.com';
    const emailLower = email.trim().toLowerCase();
    const newPassword = 'admin123'; // Set a simple password
    
    // Hash the new password (use 10 rounds to match check-user endpoint)
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Find user by username (email) - check both exact and lowercase
    let user = await prisma.user.findFirst({
      where: { username: emailLower }
    });
    
    // Also try exact case
    if (!user) {
      user = await prisma.user.findFirst({
        where: { username: email }
      });
    }
    
    if (!user) {
      console.log(`❌ User ${email} not found in database.`);
      console.log('   Creating user with admin role...');
      
      // Generate 9-digit user ID
      let userId;
      let isUnique = false;
      let attempts = 0;
      while (!isUnique && attempts < 100) {
        userId = String(Math.floor(100000000 + Math.random() * 900000000));
        const existing = await prisma.user.findUnique({ where: { id: userId } });
        if (!existing) isUnique = true;
        attempts++;
      }
      
      if (!isUnique) {
        throw new Error('Failed to generate unique user ID');
      }
      
      // Generate invitation code
      const { randomBytes } = await import('crypto');
      let invitationCode;
      let codeUnique = false;
      attempts = 0;
      while (!codeUnique && attempts < 10) {
        invitationCode = randomBytes(8).toString('hex').toUpperCase();
        const existing = await prisma.user.findUnique({ where: { invitationCode } });
        if (!existing) codeUnique = true;
        attempts++;
      }
      
      const newUser = await prisma.user.create({
        data: {
          id: userId,
          username: emailLower,
          password: hashedPassword,
          role: 'admin',
          invitationCode
        }
      });
      
      console.log(`✅ Created admin user:`);
      console.log(`   Email: ${newUser.username}`);
      console.log(`   User ID: ${newUser.id}`);
      console.log(`   Role: ${newUser.role}`);
      console.log(`   Password: ${newPassword}`);
    } else {
      // Update existing user - also ensure username is lowercase
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: {
          username: emailLower, // Ensure lowercase
          password: hashedPassword,
          role: 'admin' // Ensure they're admin
        }
      });
      
      console.log(`✅ Password reset successfully:`);
      console.log(`   Email: ${updatedUser.username}`);
      console.log(`   User ID: ${updatedUser.id}`);
      console.log(`   Role: ${updatedUser.role}`);
      console.log(`   New Password: ${newPassword}`);
    }
    
    console.log('\n💡 You can now log in with:');
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${newPassword}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

resetAdminPassword();

