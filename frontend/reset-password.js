// Quick script to reset password for a user in Prisma database
// Usage: node reset-password.js jonakfir@gmail.com newpassword123

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function resetPassword(email, newPassword) {
  try {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    const user = await prisma.user.findFirst({
      where: { username: email.toLowerCase().trim() }
    });
    
    if (!user) {
      console.log(`❌ User ${email} not found in database.`);
      console.log('\nAvailable users:');
      const allUsers = await prisma.user.findMany({
        select: { id: true, username: true, createdAt: true }
      });
      if (allUsers.length === 0) {
        console.log('  (no users in database)');
      } else {
        allUsers.forEach(u => console.log(`  - ${u.username} (ID: ${u.id})`));
      }
      console.log('\n💡 Create a new account via the registration page, or ensure you spelled the email correctly.');
      return;
    }
    
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword }
    });
    
    console.log(`✅ Password reset successfully for ${email}`);
    console.log(`   New password: ${newPassword}`);
    console.log(`   User ID: ${user.id}`);
    console.log(`\n💡 You can now log in with:\n   Email: ${email}\n   Password: ${newPassword}`);
  } catch (error) {
    console.error('❌ Error resetting password:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.log('Usage: node reset-password.js <email> <newpassword>');
  console.log('Example: node reset-password.js jonakfir@gmail.com mynewpassword');
  process.exit(1);
}

resetPassword(email, password);

