import { ProjectCategory, ProjectDifficulty } from '@prisma/client';

/**
 * The project-category vocabulary is owned by the API.  Clients must read this
 * catalog instead of carrying their own copy of the database enum.
 */
export interface ProjectCategoryDto {
  key: ProjectCategory;
  labelEn: string;
  labelAr: string;
}

export const PROJECT_CATEGORY_CATALOG: readonly ProjectCategoryDto[] = [
  { key: ProjectCategory.web, labelEn: 'Web development', labelAr: 'تطوير الويب' },
  { key: ProjectCategory.mobile, labelEn: 'Mobile applications', labelAr: 'تطبيقات الجوال' },
  { key: ProjectCategory.ai_ml, labelEn: 'AI and machine learning', labelAr: 'الذكاء الاصطناعي وتعلم الآلة' },
  { key: ProjectCategory.devops, labelEn: 'DevOps and cloud', labelAr: 'العمليات والبنية السحابية' },
  { key: ProjectCategory.tools_utilities, labelEn: 'Tools and utilities', labelAr: 'الأدوات والمرافق' },
];

export interface ProjectDifficultyDto {
  key: ProjectDifficulty;
  labelEn: string;
  labelAr: string;
}

export const PROJECT_DIFFICULTY_CATALOG: readonly ProjectDifficultyDto[] = [
  { key: ProjectDifficulty.beginner, labelEn: 'Beginner', labelAr: 'مبتدئ' },
  { key: ProjectDifficulty.intermediate, labelEn: 'Intermediate', labelAr: 'متوسط' },
  { key: ProjectDifficulty.advanced, labelEn: 'Advanced', labelAr: 'متقدم' },
];
