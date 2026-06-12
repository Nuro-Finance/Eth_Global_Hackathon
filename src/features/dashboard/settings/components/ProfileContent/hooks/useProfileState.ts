"use client";

import { useState, useRef } from "react";
import {
    type Value as PhoneValue,
    type Country,
} from "react-phone-number-input";
import { DEFAULT_USER } from "../config";

interface ProfileState {
    profileImage: string | null;
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber: PhoneValue | undefined;
    country: Country | undefined;
    birthday: Date | undefined;
}

export function useProfileState() {
    const [state, setState] = useState<ProfileState>(() => {
        const parts = DEFAULT_USER.name.split(" ", 2);
        return {
            profileImage: null,
            firstName: parts[0] ?? "",
            lastName: parts[1] ?? "",
            email: DEFAULT_USER.email,
            phoneNumber: undefined,
            country: "US",
            birthday: undefined,
        };
    });

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                setState((prev) => ({
                    ...prev,
                    profileImage: e.target?.result as string,
                }));
            };
            reader.readAsDataURL(file);
        }
    };

    const handleChangePhoto = () => {
        fileInputRef.current?.click();
    };

    const setPhoneNumber = (value: PhoneValue | undefined) => {
        setState((prev) => ({ ...prev, phoneNumber: value }));
    };

    const setCountry = (value: Country | undefined) => {
        setState((prev) => ({ ...prev, country: value }));
    };

    const setBirthday = (value: Date | undefined) => {
        setState((prev) => ({ ...prev, birthday: value }));
    };

    const setFirstName = (value: string) => {
        setState((prev) => ({ ...prev, firstName: value }));
    };
    const setLastName = (value: string) => {
        setState((prev) => ({ ...prev, lastName: value }));
    };
    const setEmail = (value: string) => {
        setState((prev) => ({ ...prev, email: value }));
    };

    return {
        ...state,
        setFirstName,
        setLastName,
        setEmail,
        fileInputRef,
        handleImageChange,
        handleChangePhoto,
        setPhoneNumber,
        setCountry,
        setBirthday,
    };
}
