// Script to set jonakfir@gmail.com as admin user
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function setAdmin() {
  try {
    const user = await prisma.user.update({
      where: { username: 'jonakfir@gmail.com' },
      data: { role: 'admin' }
    });
    console.log(`✅ Set ${user.username} (ID: ${user.id}) as admin user`);
  } catch (error) {
    if (error.code === 'P2025') {
      console.log('⚠️  User jonakfir@gmail.com not found. Creating admin user...');
      // Create admin user if it doesn't exist
      const bcrypt = await import('bcryptjs');
      const hashedPassword = await bcrypt.hash('temp', 10);
      const { randomBytes } = await import('crypto');
      
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
      let invitationCode;
      let codeUnique = false;
      attempts = 0;
      while (!codeUnique && attempts < 10) {
        invitationCode = randomBytes(8).toString('hex').toUpperCase();
        const existing = await prisma.user.findUnique({ where: { invitationCode } });
        if (!existing) codeUnique = true;
        attempts++;
      }
      
      const user = await prisma.user.create({
        data: {
          id: userId,
          username: 'jonakfir@gmail.com',
          password: hashedPassword,
          role: 'admin',
          invitationCode
        }
      });
      console.log(`✅ Created admin user ${user.username} (ID: ${user.id})`);
    } else {
      throw error;
    }
  } finally {
    await prisma.$disconnect();
  }
}

setAdmin();
