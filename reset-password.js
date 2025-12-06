// Quick script to reset password for a user in Prisma database
// Usage: node reset-password.js jonakfir@gmail.com newpassword123

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function resetPassword(email, newPassword) {
  try {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    const user = await prisma.user.findFirst({
      where: { username: email.toLowerCase().trim() }
    });
    
    if (!user) {
      console.log(`User ${email} not found in database.`);
      console.log('Available users:');
      const allUsers = await prisma.user.findMany({
        select: { username: true }
      });
      allUsers.forEach(u => console.log(`  - ${u.username}`));
      return;
    }
    
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword }
    });
    
    console.log(`✅ Password reset successfully for ${email}`);
    console.log(`   New password: ${newPassword}`);
    console.log(`   User ID: ${user.id}`);
  } catch (error) {
    console.error('Error resetting password:', error);
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

