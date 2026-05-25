export type LessonSection = {
    heading: string;
    body: string;
};

export type Lesson = {
    id: number;
    title: string;
    description: string;
    /** Short scripture reference shown on the card (e.g. "Proverbs 6:7-8") */
    verse: string;
    /** Estimated reading time in minutes */
    minutes: number;
    passage: string;
    passageRef: string;
    sections: LessonSection[];
    prayer: string;
};

export const LESSONS: Lesson[] = [
    {
        id: 1,
        title: 'Saving for the Unexpected',
        description: 'Discover how the ants can teach us a valuable lesson about hard work and having enough for each season.',
        verse: 'Proverbs 6:7-8',
        minutes: 6,
        passage: '"Take a lesson from the ants, you lazybones. Learn from their ways and become wise! Though they have no prince or governor or ruler to make them work, they labor hard all summer, gathering food for the winter."',
        passageRef: 'Proverbs 6:7-8 (NLT)',
        sections: [
            {
                heading: 'Working in the Summer',
                body: `One of the main points of this passage is how the ants work in the summer, gathering food for the winter. Some good things to get out of the way first is understanding the meaning behind summer and winter. Summer is commonly associated with times of warmth and goodness, and winter is commonly associated with times of difficulty. And goes without saying, but summer and winter represent different seasons of life.

The ant works during the time when work should be done. In Israel, summer was a great time of harvest, and winter was not. This causes us to reflect that there are seasons of work in life — seasons when it is right to gather food. Not only that, but it brings the reality that at a certain point, the time to gather food will be over. At that point, what we got in the time of work will have to be enough to take us through the winter.`,
            },
            {
                heading: 'Self Discipline is Key',
                body: `The passage also mentions an interesting characteristic of the ant: its self-discipline. Yes, almost every ant colony has a Queen. But the ants are not being micromanaged. They show independence in the work that they do. They take responsibility, and do the work that needs to be done.

You can think of it in terms of your own life. Yes, we have leaders who govern, but they have no idea if we are working or not. If we want to have good work ethic and be hard workers, we must have the discipline to do that ourselves. Just like ants, we should strive to have that quality — a nourished drive to do the work that needs to be done.`,
            },
            {
                heading: 'Concluding Remarks',
                body: `As you finish this lesson, meditate on what the Author of this Proverb said. Meditate on how the ants handle their work. Strive to do things at the time they need to be done, instead of pushing them off. And do your part to ensure that you will have enough for when a season of financial shortage comes around.`,
            },
        ],
        prayer: `Dear Lord, I thank you for sharing your wisdom with me today. Thank you for helping me understand your ways, which are higher. You are wise. I pray that you help me to work when the work needs to be done. Help me to wisely store up resources, so that I may have in abundance, even when the winters of my life come around. Lastly, I ask that you guide me in my finances. In Jesus' Name, Amen!`,
    },
    {
        id: 2,
        title: 'Giving it all to God',
        description: 'Discover what a poor widow can teach us about making God our security and giving everything to him.',
        verse: 'Luke 14:28-30',
        minutes: 7,
        passage: '"Then a poor widow came and dropped in two small coins. Jesus called his disciples to him and said "I tell you the truth, this poor widow has given more than all the others who are making contributions. For they gave a tiny part of their surplus, but she, poor as she is, has given everything she had to live on.""',
        passageRef: 'Luke 14:28–30 (NIV)',
        sections: [
            {
                heading: 'Your Source of Security',
                body: `It can be easy to envision money as our source of security. It is, after all, normal and wise for us to plan to have enough if things go wrong. God himself instructs us to do that.

What is shown here, however, points to something else. It shows a widow who understood that it is wiser for her to place her security into the hands of the Living God, than into how much money she has.`,
            },
            {
                heading: 'A Meaningful Life',
                body: `The widow's decision also shows an understanding that it is more important to be held by the hands of God than to have a lot of money.

When God is the center of our lives — and not money — he gives us a life that is rich in ways that money could never buy. And when I know that, then money will not have such a strong hold on me anymore. Whatever comes to mind when you read this passage, think about the amazing plans that God has for you, all of which are independent from money.`,
            },
        ],
        prayer: `Dear God, I thank you for being a Lord who truly guides me. I ask that you help me trust in you as my source of security, rather than my money. Help me to set my mind on you, so I can see all the amazing things you have for my life, which are not dependent on how much money I have. In Jesus' Name, Amen!`,
    },
];
