import { IsIn } from 'class-validator';

export class UpdateUserPreferencesRequest {
  @IsIn(['ar', 'en'], {
    message:
      'APPLICATION_ERROR:{"code":"AUTH_PREFERRED_LANGUAGE_INVALID","message":"Preferred language must be ar or en"}',
  })
  preferredLanguage!: 'ar' | 'en';
}
