import { Field } from '@nestjs/graphql';
import { InputType } from '@nestjs/graphql';

@InputType()
export class NestedBytesNullableFilter {
  @Field(() => String, { nullable: true })
  equals?: ReturnType<Uint8Array['slice']>;

  @Field(() => [String], { nullable: true })
  in?: Array<ReturnType<Uint8Array['slice']>>;

  @Field(() => [String], { nullable: true })
  notIn?: Array<ReturnType<Uint8Array['slice']>>;

  @Field(() => NestedBytesNullableFilter, { nullable: true })
  not?: NestedBytesNullableFilter;
}
