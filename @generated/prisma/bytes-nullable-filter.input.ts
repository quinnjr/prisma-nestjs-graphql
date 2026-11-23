import { Field } from '@nestjs/graphql';
import { InputType } from '@nestjs/graphql';
import { NestedBytesNullableFilter } from './nested-bytes-nullable-filter.input';

@InputType()
export class BytesNullableFilter {
  @Field(() => String, { nullable: true })
  equals?: ReturnType<Uint8Array['slice']>;

  @Field(() => [String], { nullable: true })
  in?: Array<ReturnType<Uint8Array['slice']>>;

  @Field(() => [String], { nullable: true })
  notIn?: Array<ReturnType<Uint8Array['slice']>>;

  @Field(() => NestedBytesNullableFilter, { nullable: true })
  not?: NestedBytesNullableFilter;
}
