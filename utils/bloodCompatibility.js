// recipient blood group -> donor blood groups that can safely give to them
const DONORS_FOR = {
  "O-": ["O-"],
  "O+": ["O+", "O-"],
  "A-": ["A-", "O-"],
  "A+": ["A+", "A-", "O+", "O-"],
  "B-": ["B-", "O-"],
  "B+": ["B+", "B-", "O+", "O-"],
  "AB-": ["AB-", "A-", "B-", "O-"],
  "AB+": ["AB+", "AB-", "A+", "A-", "B+", "B-", "O+", "O-"],
};

export const compatibleDonorGroups = (recipientGroup) => DONORS_FOR[recipientGroup] ?? [];

export const canDonateTo = (donorGroup, recipientGroup) =>
  compatibleDonorGroups(recipientGroup).includes(donorGroup);
