"use client";

import { Input } from "@/components/ui/Input";
import { PhoneInput } from "@/components/PhoneInput";
import { DatePicker } from "@/components/date-picker";
import { CountrySelect } from "@/components/country-select";
import FormField from "@/components/form-field";
import { PROFILE_FIELDS, type ProfileField } from "../config";
import {
  type Value as PhoneValue,
  type Country,
} from "react-phone-number-input";

interface ProfileFormFieldsProps {
  t: (key: string) => string;
  firstName: string;
  lastName: string;
  email: string;
  setFirstName: (value: string) => void;
  setLastName: (value: string) => void;
  setEmail: (value: string) => void;
  phoneNumber: PhoneValue | undefined;
  setPhoneNumber: (value: PhoneValue | undefined) => void;
  country: Country | undefined;
  setCountry: (value: Country | undefined) => void;
  birthday: Date | undefined;
  setBirthday: (value: Date | undefined) => void;
}

export function ProfileFormFields({
  t,
  firstName,
  lastName,
  email,
  setFirstName,
  setLastName,
  setEmail,
  phoneNumber,
  setPhoneNumber,
  country,
  setCountry,
  birthday,
  setBirthday,
}: ProfileFormFieldsProps) {
  const renderField = (field: ProfileField) => {
    switch (field.type) {
      case "phone":
        return (
          <PhoneInput
            value={phoneNumber}
            onChange={setPhoneNumber}
            defaultCountry="US"
            placeholder={field.placeholder}
            className="backdrop-blur-none"
          />
        );
      case "country":
        return (
          <CountrySelect
            value={country}
            onChange={setCountry}
            placeholder={field.placeholder}
            className="backdrop-blur-none"
          />
        );
      case "date":
        return (
          <DatePicker
            value={birthday}
            onChange={setBirthday}
            placeholder={field.placeholder}
            className="backdrop-blur-none"
          />
        );
      default: {
        const value =
          field.id === "firstName"
            ? firstName
            : field.id === "lastName"
              ? lastName
              : field.id === "email"
                ? email
                : "";
        const onChange =
          field.id === "firstName"
            ? (e: React.ChangeEvent<HTMLInputElement>) => setFirstName(e.target.value)
            : field.id === "lastName"
              ? (e: React.ChangeEvent<HTMLInputElement>) => setLastName(e.target.value)
              : field.id === "email"
                ? (e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)
                : () => {};
        return (
          <Input
            type={field.type}
            placeholder={field.placeholder}
            value={value}
            onChange={onChange}
            className="backdrop-blur-none"
          />
        );
      }
    }
  };

  return (
    <>
      {PROFILE_FIELDS.map((row, rowIndex) => {
        const isMultiColumn = row.length > 1;
        return (
          <div
            key={rowIndex}
            className={
              isMultiColumn ? "grid grid-cols-1 md:grid-cols-2 gap-6" : ""
            }
          >
            {row.map((field) => (
              <FormField key={field.id} label={t(field.labelKey)}>
                {renderField(field)}
              </FormField>
            ))}
          </div>
        );
      })}
    </>
  );
}
