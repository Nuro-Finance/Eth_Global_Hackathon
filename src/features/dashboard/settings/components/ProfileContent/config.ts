/**
 * Profile form fields configuration
 */
export interface ProfileField {
    id: string;
    labelKey: string;
    type: "text" | "email" | "phone" | "country" | "date";
    placeholder: string;
    defaultValue?: string;
    colSpan?: 1 | 2;
}

export const PROFILE_FIELDS: ProfileField[][] = [
 // Row 1 - Name fields
    [
        {
            id: "firstName",
            labelKey: "firstName",
            type: "text",
            placeholder: "First name",
            colSpan: 1,
        },
        {
            id: "lastName",
            labelKey: "lastName",
            type: "text",
            placeholder: "Last name",
            colSpan: 1,
        },
    ],
 // Row 2 - Email + Phone
    [
        {
            id: "email",
            labelKey: "email",
            type: "email",
            placeholder: "you@example.com",
            colSpan: 1,
        },
        {
            id: "phone",
            labelKey: "phone",
            type: "phone",
            placeholder: "Enter your phone number",
            colSpan: 1,
        },
    ],
 // Row 3 - Country and Birthday
    [
        {
            id: "country",
            labelKey: "country",
            type: "country",
            placeholder: "Select your country",
            colSpan: 1,
        },
        {
            id: "birthday",
            labelKey: "birthday",
            type: "date",
            placeholder: "Select your date of birth",
            colSpan: 1,
        },
    ],
];

export const DEFAULT_USER = {
    name: "",
    email: "",
    initials: "",
};
