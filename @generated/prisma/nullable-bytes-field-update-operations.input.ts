import { Field } from '@nestjs/graphql';
import { InputType } from '@nestjs/graphql';

@InputType()
export class NullableBytesFieldUpdateOperationsInput {
  @Field(() => String, { nullable: true })
  set?: ReturnType<Uint8Array['slice']>;
}
