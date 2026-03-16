import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id!: number; // corrigido: adicionando "!"

  @Column()
  name!: string; // corrigido: adicionando "!"

  @Column({ unique: true })
  email!: string; // corrigido: adicionando "!"

  @Column({ default: true })
  active!: boolean; // corrigido: adicionando "!"
}

