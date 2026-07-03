// DTO for Compatibility Quiz
export interface QuizAnswer {
  domain: string;
  questionId: string;
  answer: number; // rating 1-5 or appropriate scale
}

export interface SubmitQuizDto {
  userId: string;
  answers: QuizAnswer[];
}
