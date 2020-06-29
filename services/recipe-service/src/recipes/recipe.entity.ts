import {
  BaseEntity,
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity()
export class Recipe extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  userId: number;

  @Column()
  title: string;

  @Column()
  description: string;

  @Column()
  servings: number;

  @Column('simple-array')
  ingredients: string[];

  @Column('simple-array')
  instructions: string[];

  @Column('simple-array')
  images: string[];
}
