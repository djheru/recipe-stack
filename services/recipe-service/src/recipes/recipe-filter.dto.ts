import { IsNotEmpty, IsOptional } from 'class-validator';

export class RecipeFilterDto {
  @IsOptional()
  @IsNotEmpty()
  userId: number;

  @IsOptional()
  @IsNotEmpty()
  searchTerm: string;
}
