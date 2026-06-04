from typing import List
from pydantic import BaseModel, Field

class TechnicalQuestion(BaseModel):
    question: str = Field(description="The technical interview question")
    skill: str = Field(description="The skill being tested")
    difficulty: str = Field(description="The difficulty level of the question: Easy, Medium, or Hard")

class ProjectQuestion(BaseModel):
    question: str = Field(description="The project-related interview question")
    project: str = Field(description="The name or description of the project being asked about")

class BehavioralQuestion(BaseModel):
    question: str = Field(description="The behavioral interview question")

class FollowUpQuestion(BaseModel):
    question: str = Field(description="A follow-up interview question")
    parentQuestion: str = Field(description="The original question this follows up on")

class InterviewQuestionsSchema(BaseModel):
    technicalQuestions: List[TechnicalQuestion] = Field(description="List of technical questions", default_factory=list)
    projectQuestions: List[ProjectQuestion] = Field(description="List of project questions", default_factory=list)
    behavioralQuestions: List[BehavioralQuestion] = Field(description="List of behavioral questions", default_factory=list)
    followUpQuestions: List[FollowUpQuestion] = Field(description="List of follow-up questions", default_factory=list)
