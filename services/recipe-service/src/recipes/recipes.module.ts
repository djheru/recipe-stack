import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecipeRepository } from './recipe.repository';
import { RecipesController } from './recipes.controller';
import { RecipesService } from './recipes.service';

@Module({
  imports: [TypeOrmModule.forFeature([RecipeRepository])],
  controllers: [RecipesController],
  providers: [RecipesService],
})
export class RecipesModule {}
