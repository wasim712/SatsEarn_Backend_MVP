export const calculateLevelAndTier = (xp: number) => {
  // 1000 XP per level
  const level = Math.floor(xp / 1000);
  
  // Tier Logic: Levels 0-5 = BASIC, Level 6+ = BRONZE
  let tier: 'BASIC' | 'BRONZE' | 'SILVER' | 'GOLD' = 'BASIC';
  
  if (level >= 6 && level < 15) tier = 'BRONZE';
  if (level >= 15 && level < 30) tier = 'SILVER';
  if (level >= 30) tier = 'GOLD';

  // Calculate percentage progress to the NEXT level
  const xpInCurrentLevel = xp % 1000;
  const progressToNextLevel = (xpInCurrentLevel / 1000) * 100;

  return { 
    level, 
    tier, 
    progressToNextLevel: parseFloat(progressToNextLevel.toFixed(2)) 
  };
};