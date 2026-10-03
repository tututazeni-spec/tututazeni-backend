import {
  IsString,
  IsOptional,
  IsEmail,
  IsEnum,
  IsDateString,
  IsArray,
  IsInt,
  IsBoolean,
  IsNumber,
  Min,
  Length,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BeneficiaryType,
  BeneficiaryStatus,
  Gender,
  AngolaProvince,
  MaritalStatus,
  NeedPriority,
  FollowUpStatus,
  ConsentStatus,
} from '@prisma/client';

export class CreateBeneficiaryDto {
  @ApiProperty({ enum: BeneficiaryType })
  @IsEnum(BeneficiaryType)
  type: BeneficiaryType;

  @ApiProperty({ example: 'João Manuel dos Santos' })
  @IsString()
  @Length(2, 200)
  fullName: string;

  @ApiPropertyOptional({ example: 'Individual' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ example: '1990-01-15' })
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nationality?: string;

  @ApiPropertyOptional({ example: '123456789LA036' })
  @IsOptional()
  @IsString()
  nif?: string;

  @ApiPropertyOptional({ example: 'joao@email.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+244 923 456 789' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mobile?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ enum: AngolaProvince })
  @IsOptional()
  @IsEnum(AngolaProvince)
  province?: AngolaProvince;

  @ApiPropertyOptional({ default: 'Angola' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ example: 'Referência' })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  segment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  assignedToId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  nextFollowUpAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  beneficiaryNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  idDocumentType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  idDocumentNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  idDocumentCountry?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  photoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  alternativePhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  municipality?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  commune?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  neighborhood?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  postalCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emergencyContactName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emergencyContactPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emergencyContactRelation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  profile?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  programName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  originInstitution?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  responsibleUnit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  householdHeadName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  householdHeadRelation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employmentStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  jobTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  incomeSource?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  housingSituation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  eligibilityCriteria?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  goals?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  followUpPlan?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  followUpResult?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nextActions?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  communicationPreferences?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  idDocumentIssuedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  idDocumentExpiresAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  registeredAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  consentAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  consentRevokedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isEligible?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  consentDataProcessing?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  consentCommunications?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  consentDataSharing?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  householdSize?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  dependentsCount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monthlyIncome?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  accountManagerId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(MaritalStatus)
  maritalStatus?: MaritalStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(NeedPriority)
  priority?: NeedPriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(FollowUpStatus)
  followUpStatus?: FollowUpStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(ConsentStatus)
  consentStatus?: ConsentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  authorizedChannels?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(BeneficiaryStatus)
  status?: BeneficiaryStatus;
}
