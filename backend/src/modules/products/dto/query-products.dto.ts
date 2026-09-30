import { Transform, Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { DatasetStatus, ProductClassification, ScoreStatus } from '../../../common/interfaces/enums';

const toArray = ({ value }: { value: unknown }): string[] | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  return Array.isArray(value) ? (value as string[]) : String(value).split(',').map((item) => item.trim());
};

export class QueryProductsDto {
  @IsOptional() @IsArray() @Transform(toArray)
  category?: string[];

  @IsOptional() @IsArray() @Transform(toArray)
  marketplace?: string[];

  @IsOptional() @Type(() => Number) @IsNumber()
  priceMin?: number;

  @IsOptional() @Type(() => Number) @IsNumber()
  priceMax?: number;

  @IsOptional() @Type(() => Number) @IsNumber()
  marginMin?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100)
  demandMin?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100)
  competitionOpportunityMin?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100)
  differentiationMin?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100)
  riskMax?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100)
  scoreMin?: number;

  @IsOptional() @IsEnum(ProductClassification)
  classification?: ProductClassification;

  @IsOptional() @IsString()
  search?: string;

  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean()
  excludeSampleData?: boolean;

  /** SAMPLE / UNVERIFIED / VERIFIED — multiple allowed, comma separated. */
  @IsOptional() @IsArray() @Transform(toArray) @IsEnum(DatasetStatus, { each: true })
  datasetStatus?: DatasetStatus[];

  @IsOptional() @IsEnum(ScoreStatus)
  scoreStatus?: ScoreStatus;

  /** Shorthand for the Verified Opportunities view: non-SAMPLE data with a COMPLETE score. */
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean()
  verifiedOnly?: boolean;

  @IsOptional() @IsString()
  sortBy?: 'finalScore' | 'profitMarginPercentage' | 'demandScore' | 'riskScore' | 'sellingPrice';

  @IsOptional() @IsString()
  sortDirection?: 'ASC' | 'DESC';

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500)
  limit?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  offset?: number;
}
