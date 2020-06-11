import { ArrayNotEmpty, IsNotEmpty } from 'class-validator';

export class RecipeDto {
  @IsNotEmpty()
  userId: null;

  @IsNotEmpty()
  title: string;

  @IsNotEmpty()
  description: string;

  servings: number;

  @ArrayNotEmpty()
  ingredients: string[];

  @ArrayNotEmpty()
  instructions: string[];

  images: string[];
}
